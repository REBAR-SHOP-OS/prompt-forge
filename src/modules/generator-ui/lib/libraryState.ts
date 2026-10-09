// Library state sync: mirrors the per-user "library layout" localStorage keys
// (Final Videos, Drafts, covers, ordering, etc.) to the backend so the library
// looks identical across browsers/devices.
//
// Source of truth: public.generator_library_state (one jsonb row per user).
// localStorage stays as a fast cache; this module hydrates it on login and
// pushes changes back (debounced) without touching the dashboard render logic.
import { supabase } from "@/integrations/supabase/client";
import {
  compactLibraryDocument,
  compactSerializedLibraryValue,
  MAX_LIBRARY_STATE_BYTES,
  type LibraryCompactionResult,
} from "./libraryStateCompaction";

// Per-user keys that make up the library layout. Stored as `${prefix}:${userId}`.
// Device-only preferences (aspect ratio, preferred model) are intentionally
// excluded so each device keeps its own.
const TRACKED_PREFIXES = [
  "approved-videos",
  "merged-videos",
  "library-saved-jobs",
  "pending-end-appends",
  "pending-start-prepends",
  "edited-clips",
  "workspace-hidden-jobs",
  "project-source-jobs",
  "project-source-images",
  "project-audio",
  "draft-entries",
  "draft-source-jobs",
  "draft-source-images",
  "active-draft-id",
  "job-draft-map",
  "image-draft-map",
  "project-cover-images",
  "deleted-draft-ids",
  "workspace-hidden-images",
  "workspace-active-jobs",
  "workspace-active-images",
  "selected-project",
  "preview-state",
  // Card drag-order map (`manual-card-order:${userId}` holds a JSON
  // scope->order map). Tracked so ordering syncs across devices.
  "manual-card-order",
] as const;

export type LibraryDoc = Record<string, string>;

export interface LibraryStateRow {
  state: LibraryDoc;
  version: number;
}

export type LibraryBackendResult<T> =
  | { status: "success"; value: T }
  | { status: "conflict" }
  | { status: "error"; error?: unknown };

export type LibrarySyncResult =
  | { status: "success" }
  | { status: "conflict"; conflictingKeys: string[] }
  | { status: "error" };

export interface LibraryStateBackend {
  read(userId: string): Promise<LibraryBackendResult<LibraryStateRow | null>>;
  insert(
    userId: string,
    state: LibraryDoc,
    version: number,
  ): Promise<LibraryBackendResult<void>>;
  updateIfVersion(
    userId: string,
    state: LibraryDoc,
    expectedVersion: number,
    nextVersion: number,
  ): Promise<LibraryBackendResult<void>>;
}

type LibraryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface LibraryBaseline {
  state: LibraryDoc;
  version: number;
}

const MAX_KEEPALIVE_BYTES = 60 * 1024;

export type LibraryKeepaliveRequest = {
  method: "POST" | "PATCH";
  query: string;
  body: string;
};

function trackedKeysFor(userId: string): string[] {
  return TRACKED_PREFIXES.map((prefix) => `${prefix}:${userId}`);
}

function cloneDoc(doc: LibraryDoc): LibraryDoc {
  return { ...doc };
}

function snapshotLocal(userId: string, storage: LibraryStorage): LibraryDoc {
  const doc: LibraryDoc = {};
  for (const key of trackedKeysFor(userId)) {
    const raw = storage.getItem(key);
    if (raw == null) continue;
    const compacted = compactSerializedLibraryValue(raw);
    doc[key] = compacted.value;
    if (compacted.changed) {
      try {
        storage.setItem(key, compacted.value);
      } catch {
        // The compacted server payload remains safe even if browser storage is unavailable.
      }
    }
  }
  return doc;
}

function prepareForSync(
  state: LibraryDoc,
  operation: string,
  budgetBytes = MAX_LIBRARY_STATE_BYTES,
): LibraryCompactionResult | null {
  const compacted = compactLibraryDocument(state, budgetBytes);
  if (compacted.withinBudget) return compacted;
  console.warn("library-state sync skipped oversized state", {
    operation,
    byteSize: compacted.byteSize,
    keyCount: compacted.keyCount,
  });
  return null;
}

function hasAnyLocal(userId: string, storage: LibraryStorage): boolean {
  return trackedKeysFor(userId).some((key) => storage.getItem(key) != null);
}

function replaceLocalFromDoc(userId: string, doc: LibraryDoc, storage: LibraryStorage) {
  for (const key of trackedKeysFor(userId)) {
    const value = doc[key];
    try {
      if (typeof value === "string") {
        storage.setItem(key, value);
      } else {
        storage.removeItem(key);
      }
    } catch {
      // Keep hydration best-effort for storage quota/security errors.
    }
  }
}

function sameEntry(left: LibraryDoc, right: LibraryDoc, key: string): boolean {
  const leftHasKey = Object.prototype.hasOwnProperty.call(left, key);
  const rightHasKey = Object.prototype.hasOwnProperty.call(right, key);
  return leftHasKey === rightHasKey && (!leftHasKey || left[key] === right[key]);
}

export function mergeLibraryDocs(
  userId: string,
  base: LibraryDoc,
  local: LibraryDoc,
  server: LibraryDoc,
): { state: LibraryDoc; conflictingKeys: string[] } {
  const state: LibraryDoc = {};
  const conflictingKeys: string[] = [];

  for (const key of trackedKeysFor(userId)) {
    const localChanged = !sameEntry(base, local, key);
    const serverChanged = !sameEntry(base, server, key);

    if (localChanged && serverChanged && !sameEntry(local, server, key)) {
      conflictingKeys.push(key);
      continue;
    }

    const source = localChanged ? local : server;
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      state[key] = source[key];
    }
  }

  return { state, conflictingKeys };
}

function aborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

export function createLibraryStateSync(
  backend: LibraryStateBackend,
  storage: LibraryStorage,
) {
  const baselines = new Map<string, LibraryBaseline>();
  const pushInFlight = new Set<string>();

  const reconcileConflict = async (
    userId: string,
    baseline: LibraryBaseline,
    localState: LibraryDoc,
    signal?: AbortSignal,
  ): Promise<LibrarySyncResult> => {
    const latestResult = await backend.read(userId);
    if (aborted(signal)) return { status: "error" };
    if (latestResult.status === "error") return { status: "error" };
    if (latestResult.status === "conflict" || !latestResult.value) {
      return { status: "conflict", conflictingKeys: [] };
    }

    const latest = latestResult.value;
    const latestPrepared = prepareForSync(latest.state ?? {}, "conflict-read");
    if (!latestPrepared) return { status: "error" };
    const merged = mergeLibraryDocs(
      userId,
      baseline.state,
      localState,
      latestPrepared.state,
    );
    if (merged.conflictingKeys.length > 0) {
      return { status: "conflict", conflictingKeys: merged.conflictingKeys };
    }

    const mergedPrepared = prepareForSync(merged.state, "conflict-write");
    if (!mergedPrepared) return { status: "error" };

    // A conflict recovery gets one CAS against the freshly-read version. A
    // second race remains observable and retryable instead of busy-looping.
    const saved = await backend.updateIfVersion(
      userId,
      mergedPrepared.state,
      latest.version,
      latest.version + 1,
    );
    if (aborted(signal)) return { status: "error" };
    if (saved.status === "error") return { status: "error" };
    if (saved.status === "conflict") {
      return { status: "conflict", conflictingKeys: [] };
    }

    replaceLocalFromDoc(userId, mergedPrepared.state, storage);
    baselines.set(userId, {
      state: cloneDoc(mergedPrepared.state),
      version: latest.version + 1,
    });
    return { status: "success" };
  };

  const push = async (
    userId: string,
    signal?: AbortSignal,
  ): Promise<LibrarySyncResult> => {
    const baseline = baselines.get(userId);
    if (!userId || !baseline || aborted(signal) || pushInFlight.has(userId)) {
      return { status: "error" };
    }

    pushInFlight.add(userId);
    try {
      const localSnapshot = snapshotLocal(userId, storage);
      const localPrepared = prepareForSync(localSnapshot, "push");
      if (!localPrepared) return { status: "error" };
      const localState = localPrepared.state;
      const nextVersion = baseline.version + 1;
      const saved = baseline.version === 0
        ? await backend.insert(userId, localState, nextVersion)
        : await backend.updateIfVersion(
            userId,
            localState,
            baseline.version,
            nextVersion,
          );

      if (aborted(signal)) return { status: "error" };
      if (saved.status === "error") return { status: "error" };
      if (saved.status === "conflict") {
        return reconcileConflict(userId, baseline, localState, signal);
      }

      baselines.set(userId, { state: cloneDoc(localState), version: nextVersion });
      return { status: "success" };
    } catch {
      return { status: "error" };
    } finally {
      pushInFlight.delete(userId);
    }
  };

  const hydrate = async (
    userId: string,
    signal?: AbortSignal,
    preserveLocal = false,
  ): Promise<LibrarySyncResult> => {
    if (!userId || aborted(signal)) return { status: "error" };

    // A retry after a sync failure/conflict must reconcile the preserved local
    // edits; re-hydrating from scratch would silently discard them.
    if (baselines.has(userId)) return push(userId, signal);

    try {
      const readResult = await backend.read(userId);
      if (aborted(signal)) return { status: "error" };
      if (readResult.status !== "success") {
        return readResult.status === "conflict"
          ? { status: "conflict", conflictingKeys: [] }
          : { status: "error" };
      }

      const row = readResult.value;
      if (row) {
        const prepared = prepareForSync(row.state ?? {}, "hydrate");
        if (!prepared) return { status: "error" };
        if (preserveLocal && hasAnyLocal(userId, storage)) {
          const localPrepared = prepareForSync(snapshotLocal(userId, storage), "hydrate-recovery");
          if (!localPrepared) return { status: "error" };
          const localSerialized = JSON.stringify(localPrepared.state);
          const serverSerialized = JSON.stringify(prepared.state);
          if (localSerialized !== serverSerialized) {
            return {
              status: "conflict",
              conflictingKeys: Object.keys(localPrepared.state)
                .filter((key) => !sameEntry(localPrepared.state, prepared.state, key)),
            };
          }
        }
        let version = row.version ?? 0;
        // Legacy inline thumbnails are compacted exactly once and persisted
        // through the existing CAS contract before local cache replacement.
        if (prepared.changed) {
          const saved = await backend.updateIfVersion(
            userId,
            prepared.state,
            version,
            version + 1,
          );
          if (aborted(signal)) return { status: "error" };
          if (saved.status === "error") return { status: "error" };
          if (saved.status === "conflict") {
            return { status: "conflict", conflictingKeys: [] };
          }
          version += 1;
        }
        replaceLocalFromDoc(userId, prepared.state, storage);
        baselines.set(userId, {
          state: cloneDoc(prepared.state),
          version,
        });
        return { status: "success" };
      }

      const localSnapshot = snapshotLocal(userId, storage);
      const localPrepared = prepareForSync(localSnapshot, "hydrate-insert");
      if (!localPrepared) return { status: "error" };
      const localState = localPrepared.state;
      if (hasAnyLocal(userId, storage)) {
        const inserted = await backend.insert(userId, localState, 1);
        if (aborted(signal)) return { status: "error" };
        if (inserted.status === "error") return { status: "error" };
        if (inserted.status === "conflict") {
          return reconcileConflict(
            userId,
            { state: {}, version: 0 },
            localState,
            signal,
          );
        }
        baselines.set(userId, { state: cloneDoc(localState), version: 1 });
      } else {
        baselines.set(userId, { state: {}, version: 0 });
      }
      return { status: "success" };
    } catch {
      return { status: "error" };
    }
  };

  const prepareKeepalive = (
    userId: string,
    maxBytes = MAX_KEEPALIVE_BYTES,
  ): LibraryKeepaliveRequest | null => {
    const baseline = baselines.get(userId);
    if (!userId || !baseline) return null;

    const localSnapshot = snapshotLocal(userId, storage);
    const prepared = prepareForSync(localSnapshot, "keepalive");
    if (!prepared) return null;
    const localState = prepared.state;
    if (JSON.stringify(localState) === JSON.stringify(baseline.state)) return null;

    const nextVersion = baseline.version + 1;
    const method = baseline.version === 0 ? "POST" : "PATCH";
    const body = JSON.stringify(method === "POST"
      ? { user_id: userId, state: localState, version: nextVersion }
      : { state: localState, version: nextVersion });
    if (new TextEncoder().encode(body).byteLength > maxBytes) return null;

    return {
      method,
      query: method === "POST"
        ? ""
        : `?user_id=eq.${encodeURIComponent(userId)}&version=eq.${baseline.version}`,
      body,
    };
  };

  return { hydrate, push, prepareKeepalive };
}

const supabaseBackend: LibraryStateBackend = {
  async read(userId) {
    const { data, error } = await supabase
      .from("generator_library_state")
      .select("state, version")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { status: "error", error };
    if (!data) return { status: "success", value: null };
    return {
      status: "success",
      value: {
        state: (data.state as LibraryDoc | null) ?? {},
        version: (data.version as number | null) ?? 0,
      },
    };
  },
  async insert(userId, state, version) {
    const { error } = await supabase
      .from("generator_library_state")
      .insert({ user_id: userId, state, version });
    if (!error) return { status: "success", value: undefined };
    if (error.code === "23505") return { status: "conflict" };
    return { status: "error", error };
  },
  async updateIfVersion(userId, state, expectedVersion, nextVersion) {
    const { data, error } = await supabase
      .from("generator_library_state")
      .update({ state, version: nextVersion })
      .eq("user_id", userId)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle();
    if (error) return { status: "error", error };
    if (data?.version !== nextVersion) return { status: "conflict" };
    return { status: "success", value: undefined };
  },
};

let browserSync: ReturnType<typeof createLibraryStateSync> | null = null;

function getBrowserSync() {
  if (typeof window === "undefined") return null;
  if (!browserSync) {
    browserSync = createLibraryStateSync(supabaseBackend, window.localStorage);
  }
  return browserSync;
}

export async function hydrateLibraryFromServer(
  userId: string,
  signal?: AbortSignal,
  preserveLocal = false,
): Promise<LibrarySyncResult> {
  return (await getBrowserSync()?.hydrate(userId, signal, preserveLocal)) ?? { status: "error" };
}

export async function pushLibraryToServer(userId: string): Promise<LibrarySyncResult> {
  return (await getBrowserSync()?.push(userId)) ?? { status: "error" };
}

export function hasUsableLocalLibraryCache(
  userId: string,
  storage?: LibraryStorage,
): boolean {
  const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!userId || !target) return false;
  const compactedLocal = snapshotLocal(userId, target);
  for (const key of trackedKeysFor(userId)) {
    const raw = compactedLocal[key];
    if (raw == null || raw.length === 0) continue;
    try {
      JSON.parse(raw);
      return true;
    } catch {
      if (key.startsWith("active-draft-id:") || key.startsWith("selected-project:")) {
        return true;
      }
    }
  }
  return false;
}

type SupabasePublicConfig = { supabaseUrl: string; supabaseKey: string };

export function sendLibraryKeepaliveRequest(
  request: LibraryKeepaliveRequest,
  accessToken: string | null,
  config: SupabasePublicConfig,
  fetchImpl: typeof fetch = fetch,
): boolean {
  if (!accessToken || !config.supabaseUrl || !config.supabaseKey) return false;
  try {
    void fetchImpl(
      `${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/generator_library_state${request.query}`,
      {
        method: request.method,
        keepalive: true,
        headers: {
          apikey: config.supabaseKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: request.body,
      },
    ).catch(() => {
      // localStorage remains the fallback cache; the next normal sync retries.
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Watch localStorage and push changes with bounded retries. Failures remain
 * background-only so generation and editing can continue from the local cache.
 */
export function startLibrarySync(
  userId: string,
  onResult?: (result: LibrarySyncResult) => void,
): () => void {
  if (!userId || typeof window === "undefined") return () => {};

  const RETRY_BACKOFF_MS = [1_000, 3_000, 10_000] as const;
  const fingerprint = () => {
    const compacted = compactLibraryDocument(snapshotLocal(userId, window.localStorage));
    return compacted.withinBudget
      ? JSON.stringify(compacted.state)
      : `oversized:${compacted.byteSize}:${compacted.keyCount}`;
  };

  let lastSerialized = fingerprint();
  let debounceTimer: number | undefined;
  let pushing = false;
  let stopped = false;
  let accessToken: string | null = null;
  let keepaliveSerialized: string | null = null;
  let failedSerialized: string | null = null;
  let blockedSerialized: string | null = null;
  let retryCount = 0;

  void supabase.auth.getSession().then(({ data }) => {
    if (!stopped && data.session?.user.id === userId) {
      accessToken = data.session.access_token;
    }
  }).catch(() => {
    accessToken = null;
  });
  const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
    accessToken = session?.user.id === userId ? session.access_token : null;
  });

  const schedulePush = (delayMs = 800) => {
    if (pushing || stopped || debounceTimer) return;
    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
      void runPush();
    }, delayMs);
  };

  const runPush = async () => {
    if (pushing || stopped) return;
    const serialized = fingerprint();
    if (serialized === lastSerialized || serialized === blockedSerialized) return;
    pushing = true;
    const result = await pushLibraryToServer(userId);
    pushing = false;
    if (stopped) return;
    onResult?.(result);
    if (result.status === "success") {
      lastSerialized = serialized;
      failedSerialized = null;
      blockedSerialized = null;
      retryCount = 0;
      return;
    }

    const current = fingerprint();
    if (current !== serialized) {
      failedSerialized = null;
      blockedSerialized = null;
      retryCount = 0;
      schedulePush();
      return;
    }
    if (failedSerialized !== serialized) {
      failedSerialized = serialized;
      retryCount = 0;
    }
    if (retryCount < RETRY_BACKOFF_MS.length) {
      schedulePush(RETRY_BACKOFF_MS[retryCount]);
      retryCount += 1;
    } else {
      // Do not retry the same failed payload forever. A later local change or
      // browser online event creates a new bounded retry cycle.
      blockedSerialized = serialized;
    }
  };

  const tick = () => {
    if (document.visibilityState === "hidden") return;
    const serialized = fingerprint();
    if (serialized !== failedSerialized && serialized !== blockedSerialized) {
      retryCount = 0;
    }
    if (serialized !== lastSerialized && serialized !== blockedSerialized) schedulePush();
  };

  const intervalId = window.setInterval(tick, 1500);

  const flushAsync = () => {
    const serialized = fingerprint();
    if (serialized !== lastSerialized && serialized !== blockedSerialized) void runPush();
  };

  const flushKeepalive = () => {
    const serialized = fingerprint();
    if (serialized === lastSerialized || serialized === keepaliveSerialized) return;
    keepaliveSerialized = serialized;
    const request = getBrowserSync()?.prepareKeepalive(userId);
    const config = supabase as unknown as SupabasePublicConfig;
    if (request && sendLibraryKeepaliveRequest(request, accessToken, config)) return;
    // Oversized or unavailable keepalive requests never send their payload.
    // A normal bounded retry is attempted without unmounting the dashboard.
    void runPush();
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      flushKeepalive();
    } else {
      keepaliveSerialized = null;
      flushAsync();
    }
  };
  const onOnline = () => {
    if (blockedSerialized === fingerprint()) {
      blockedSerialized = null;
      failedSerialized = null;
      retryCount = 0;
    }
    schedulePush();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", flushKeepalive);
  window.addEventListener("online", onOnline);

  return () => {
    stopped = true;
    if (debounceTimer) window.clearTimeout(debounceTimer);
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", flushKeepalive);
    window.removeEventListener("online", onOnline);
    authSubscription.subscription.unsubscribe();
  };
}
