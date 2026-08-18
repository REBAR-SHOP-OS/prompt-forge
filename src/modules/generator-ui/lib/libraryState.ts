// Library state sync: mirrors the per-user "library layout" localStorage keys
// (Final Videos, Drafts, covers, ordering, etc.) to the backend so the library
// looks identical across browsers/devices.
//
// Source of truth: public.generator_library_state (one jsonb row per user).
// localStorage stays as a fast cache; this module hydrates it on login and
// pushes changes back (debounced) without touching the dashboard render logic.
import { supabase } from "@/integrations/supabase/client";

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
    if (raw != null) doc[key] = raw;
  }
  return doc;
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
    const merged = mergeLibraryDocs(
      userId,
      baseline.state,
      localState,
      latest.state ?? {},
    );
    if (merged.conflictingKeys.length > 0) {
      return { status: "conflict", conflictingKeys: merged.conflictingKeys };
    }

    // A conflict recovery gets one CAS against the freshly-read version. A
    // second race remains observable and retryable instead of busy-looping.
    const saved = await backend.updateIfVersion(
      userId,
      merged.state,
      latest.version,
      latest.version + 1,
    );
    if (aborted(signal)) return { status: "error" };
    if (saved.status === "error") return { status: "error" };
    if (saved.status === "conflict") {
      return { status: "conflict", conflictingKeys: [] };
    }

    replaceLocalFromDoc(userId, merged.state, storage);
    baselines.set(userId, {
      state: cloneDoc(merged.state),
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
      const localState = snapshotLocal(userId, storage);
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
        replaceLocalFromDoc(userId, row.state ?? {}, storage);
        baselines.set(userId, {
          state: cloneDoc(row.state ?? {}),
          version: row.version ?? 0,
        });
        return { status: "success" };
      }

      const localState = snapshotLocal(userId, storage);
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

  return { hydrate, push };
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
): Promise<LibrarySyncResult> {
  return (await getBrowserSync()?.hydrate(userId, signal)) ?? { status: "error" };
}

export async function pushLibraryToServer(userId: string): Promise<LibrarySyncResult> {
  return (await getBrowserSync()?.push(userId)) ?? { status: "error" };
}

/**
 * Start watching localStorage for library changes and push them up (debounced).
 * The first failed/conflicted push is reported to the gate, which owns stopping
 * this watcher and showing the retry UI.
 */
export function startLibrarySync(
  userId: string,
  onIssue?: (result: Exclude<LibrarySyncResult, { status: "success" }>) => void,
): () => void {
  if (!userId || typeof window === "undefined") return () => {};

  let lastSerialized = JSON.stringify(snapshotLocal(userId, window.localStorage));
  let debounceTimer: number | undefined;
  let pushing = false;
  let stopped = false;

  const runPush = async () => {
    if (pushing || stopped) return;
    pushing = true;
    const serialized = JSON.stringify(snapshotLocal(userId, window.localStorage));
    const result = await pushLibraryToServer(userId);
    pushing = false;
    if (stopped) return;
    if (result.status === "success") {
      lastSerialized = serialized;
    } else {
      onIssue?.(result);
    }
  };

  const schedulePush = () => {
    if (pushing || stopped) return;
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
      void runPush();
    }, 800);
  };

  const tick = () => {
    const serialized = JSON.stringify(snapshotLocal(userId, window.localStorage));
    if (serialized !== lastSerialized) schedulePush();
  };

  const intervalId = window.setInterval(tick, 1500);

  const flushNow = () => {
    const serialized = JSON.stringify(snapshotLocal(userId, window.localStorage));
    if (serialized !== lastSerialized) void runPush();
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") flushNow();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("beforeunload", flushNow);

  return () => {
    stopped = true;
    if (debounceTimer) window.clearTimeout(debounceTimer);
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("beforeunload", flushNow);
  };
}
