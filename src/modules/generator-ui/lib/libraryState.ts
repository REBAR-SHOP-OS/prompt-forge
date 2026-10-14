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

// Device-local sync bookkeeping. These keys are deliberately NOT tracked: they
// are never uploaded and never part of the synced document.
//  - baseline: the last state this device and the server agreed on, plus its
//    server version: the common ancestor for every three-way merge, kept
//    across reloads.
//  - diverged: an unresolved recovery divergence; local work must survive
//    reloads until reconciliation merges it or the user resolves it.
function baselineKey(userId: string): string {
  return `library-baseline:${userId}`;
}

function divergedKey(userId: string): string {
  return `library-diverged:${userId}`;
}

function readPersistedBaseline(
  userId: string,
  storage: LibraryStorage,
): LibraryBaseline | null {
  try {
    const raw = storage.getItem(baselineKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: unknown; version?: unknown } | null;
    const version = parsed?.version;
    const state = parsed?.state;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 0) return null;
    if (!state || typeof state !== "object" || Array.isArray(state)) return null;
    const doc: LibraryDoc = {};
    for (const [key, value] of Object.entries(state)) {
      if (typeof value !== "string") return null;
      doc[key] = value;
    }
    return { state: trackedDoc(userId, doc), version };
  } catch {
    return null;
  }
}

function cloneDoc(doc: LibraryDoc): LibraryDoc {
  return { ...doc };
}

function trackedDoc(userId: string, doc: LibraryDoc): LibraryDoc {
  const tracked = new Set(trackedKeysFor(userId));
  return Object.fromEntries(
    Object.entries(doc).filter(([key]) => tracked.has(key)),
  );
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

function differingKeys(left: LibraryDoc, right: LibraryDoc): string[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return Array.from(keys).filter((key) => !sameEntry(left, right, key));
}

function sameDoc(left: LibraryDoc, right: LibraryDoc): boolean {
  return differingKeys(left, right).length === 0;
}

export function mergeLibraryDocs(
  userId: string,
  base: LibraryDoc,
  local: LibraryDoc,
  server: LibraryDoc,
  // An explicit user resolution ("keep my work") settles same-key conflicts
  // in favor of local; without it they are reported and left out.
  preferOnConflict?: "local",
): { state: LibraryDoc; conflictingKeys: string[] } {
  const state: LibraryDoc = {};
  const conflictingKeys: string[] = [];

  for (const key of trackedKeysFor(userId)) {
    const localChanged = !sameEntry(base, local, key);
    const serverChanged = !sameEntry(base, server, key);

    if (localChanged && serverChanged && !sameEntry(local, server, key)) {
      if (preferOnConflict === "local") {
        if (Object.prototype.hasOwnProperty.call(local, key)) state[key] = local[key];
        continue;
      }
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
  const divergences = new Map<string, string[]>();
  const pushInFlight = new Set<string>();

  const clearDivergence = (userId: string) => {
    divergences.delete(userId);
    try {
      storage.removeItem(divergedKey(userId));
    } catch {
      // The in-memory record is already cleared.
    }
  };

  const recordDivergence = (userId: string, conflictingKeys: string[]) => {
    divergences.set(userId, [...conflictingKeys]);
    try {
      storage.setItem(divergedKey(userId), JSON.stringify(conflictingKeys));
    } catch {
      // The in-memory record still blocks pushes for this session.
    }
  };

  const divergenceFor = (userId: string): string[] | null => {
    const recorded = divergences.get(userId);
    if (recorded) return [...recorded];
    try {
      const raw = storage.getItem(divergedKey(userId));
      if (raw == null) return null;
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((key): key is string => typeof key === "string")
        : [];
    } catch {
      return [];
    }
  };

  // Every success path records the newly agreed state through here. It is
  // persisted device-locally so a reload can still three-way merge preserved
  // local work against the true common ancestor; agreeing also settles any
  // recorded divergence.
  const setBaseline = (userId: string, baseline: LibraryBaseline) => {
    const next = { state: cloneDoc(baseline.state), version: baseline.version };
    baselines.set(userId, next);
    try {
      storage.setItem(baselineKey(userId), JSON.stringify(next));
    } catch {
      // A stale persisted ancestor could mis-attribute changes after a
      // reload. Drop it so recovery fails closed into a visible conflict.
      try {
        storage.removeItem(baselineKey(userId));
      } catch {
        // Nothing more can be done with unavailable storage.
      }
    }
    clearDivergence(userId);
  };

  type ServerRead =
    | { status: "success"; row: LibraryBaseline | null }
    | Exclude<LibrarySyncResult, { status: "success" }>;

  // Reads the server row as a tracked, compacted document. Legacy inline
  // thumbnails are compacted exactly once and persisted through the CAS
  // contract before any caller uses the state.
  const readServer = async (
    userId: string,
    operation: string,
    signal?: AbortSignal,
  ): Promise<ServerRead> => {
    const readResult = await backend.read(userId);
    if (aborted(signal)) return { status: "error" };
    if (readResult.status !== "success") {
      return readResult.status === "conflict"
        ? { status: "conflict", conflictingKeys: [] }
        : { status: "error" };
    }
    const row = readResult.value;
    if (!row) return { status: "success", row: null };

    const prepared = prepareForSync(trackedDoc(userId, row.state ?? {}), operation);
    if (!prepared) return { status: "error" };
    let version = row.version ?? 0;
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
    return { status: "success", row: { state: prepared.state, version } };
  };

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
    const latestPrepared = prepareForSync(
      trackedDoc(userId, latest.state ?? {}),
      "conflict-read",
    );
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

    // When the merge is exactly the server state (e.g. a stale cache with no
    // local edits), adopt it without writing anything.
    let savedVersion = latest.version;
    if (!sameDoc(mergedPrepared.state, latestPrepared.state)) {
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
      savedVersion = latest.version + 1;
    }

    const currentLocal = snapshotLocal(userId, storage);
    if (!sameDoc(currentLocal, localState)) {
      const rebased = mergeLibraryDocs(
        userId,
        localState,
        currentLocal,
        mergedPrepared.state,
      );
      if (rebased.conflictingKeys.length > 0) {
        // The merged state is already saved on the server, but the local
        // edit that landed during the CAS cannot be rebased onto it. Do NOT
        // advance the baseline to the merged state here: keeping the old
        // baseline makes the next push fail its CAS and re-enter
        // reconciliation, which merges against the merged server state.
        // Advancing the baseline first would let that push write the stale
        // local document directly over the merged server changes.
        return { status: "conflict", conflictingKeys: rebased.conflictingKeys };
      }
      setBaseline(userId, { state: mergedPrepared.state, version: savedVersion });
      replaceLocalFromDoc(userId, rebased.state, storage);
      return { status: "success" };
    }
    setBaseline(userId, { state: mergedPrepared.state, version: savedVersion });
    replaceLocalFromDoc(userId, mergedPrepared.state, storage);
    return { status: "success" };
  };

  const push = async (
    userId: string,
    signal?: AbortSignal,
  ): Promise<LibrarySyncResult> => {
    // An unresolved recovery divergence fails closed: only reconciliation or
    // an explicit user resolution may write while local and server disagree.
    const divergence = userId ? divergenceFor(userId) : null;
    if (divergence) return { status: "conflict", conflictingKeys: divergence };

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

      setBaseline(userId, { state: localState, version: nextVersion });
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
      const server = await readServer(userId, "hydrate", signal);
      if (server.status !== "success") return server;

      const row = server.row;
      if (row) {
        const ancestor = readPersistedBaseline(userId, storage);
        const divergence = divergenceFor(userId);
        // Local work is preserved whenever it may hold unsynced changes: an
        // explicit recovery, an unresolved divergence, or a persisted
        // ancestor (whose three-way merge tells a stale cache from edits).
        // Without one of these, the server state replaces the cache.
        const preserving = preserveLocal || ancestor != null || divergence != null;
        if (preserving && hasAnyLocal(userId, storage)) {
          const localPrepared = prepareForSync(snapshotLocal(userId, storage), "hydrate-recovery");
          if (!localPrepared) return { status: "error" };
          if (!sameDoc(localPrepared.state, row.state)) {
            if (!ancestor) {
              // The diverged work predates any recorded sync, so there is no
              // common ancestor to merge against. Never fabricate one from the
              // server state: stay visibly conflicted until the user decides.
              const conflictingKeys = differingKeys(localPrepared.state, row.state);
              recordDivergence(userId, conflictingKeys);
              return { status: "conflict", conflictingKeys };
            }
            const reconciled = await reconcileConflict(
              userId,
              ancestor,
              localPrepared.state,
              signal,
            );
            if (reconciled.status === "conflict") {
              recordDivergence(userId, reconciled.conflictingKeys);
            }
            return reconciled;
          }
        }
        setBaseline(userId, row);
        replaceLocalFromDoc(userId, row.state, storage);
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
        setBaseline(userId, { state: localState, version: 1 });
      } else {
        setBaseline(userId, { state: {}, version: 0 });
      }
      return { status: "success" };
    } catch {
      return { status: "error" };
    }
  };

  // Explicit "keep my work". Reconciles against the persisted ancestor when
  // one exists, so the other device's non-conflicting changes survive and
  // local wins only the keys that truly conflict. Without an ancestor it is
  // the user's explicit choice to overwrite the synced copy with this one.
  // Every write is CAS-guarded against the version just read.
  const resolveWithLocal = async (
    userId: string,
    signal?: AbortSignal,
  ): Promise<LibrarySyncResult> => {
    if (!userId || aborted(signal) || pushInFlight.has(userId)) {
      return { status: "error" };
    }

    pushInFlight.add(userId);
    try {
      const server = await readServer(userId, "resolve-local-read", signal);
      if (server.status !== "success") return server;
      const localPrepared = prepareForSync(snapshotLocal(userId, storage), "resolve-local");
      if (!localPrepared) return { status: "error" };
      const localState = localPrepared.state;

      const row = server.row;
      if (!row) {
        const inserted = await backend.insert(userId, localState, 1);
        if (aborted(signal)) return { status: "error" };
        if (inserted.status === "error") return { status: "error" };
        if (inserted.status === "conflict") return { status: "conflict", conflictingKeys: [] };
        setBaseline(userId, { state: localState, version: 1 });
        return { status: "success" };
      }

      const ancestor = readPersistedBaseline(userId, storage);
      const resolved = ancestor
        ? mergeLibraryDocs(userId, ancestor.state, localState, row.state, "local").state
        : localState;
      const resolvedPrepared = prepareForSync(resolved, "resolve-local-write");
      if (!resolvedPrepared) return { status: "error" };

      let savedVersion = row.version;
      if (!sameDoc(resolvedPrepared.state, row.state)) {
        const saved = await backend.updateIfVersion(
          userId,
          resolvedPrepared.state,
          row.version,
          row.version + 1,
        );
        if (aborted(signal)) return { status: "error" };
        if (saved.status === "error") return { status: "error" };
        if (saved.status === "conflict") {
          // The server moved again; the divergence stays recorded.
          return { status: "conflict", conflictingKeys: divergenceFor(userId) ?? [] };
        }
        savedVersion = row.version + 1;
      }

      setBaseline(userId, { state: resolvedPrepared.state, version: savedVersion });
      // Local edits that landed during the write are kept on top of the
      // resolved state; the next push syncs them from the new baseline.
      const currentLocal = snapshotLocal(userId, storage);
      const nextLocal = sameDoc(currentLocal, localState)
        ? resolvedPrepared.state
        : mergeLibraryDocs(userId, localState, currentLocal, resolvedPrepared.state, "local").state;
      replaceLocalFromDoc(userId, nextLocal, storage);
      return { status: "success" };
    } catch {
      return { status: "error" };
    } finally {
      pushInFlight.delete(userId);
    }
  };

  // Explicit "use synced version": discards the diverged local copy and adopts
  // the server document. Nothing is written to the server.
  const resolveWithServer = async (
    userId: string,
    signal?: AbortSignal,
  ): Promise<LibrarySyncResult> => {
    if (!userId || aborted(signal) || pushInFlight.has(userId)) {
      return { status: "error" };
    }

    pushInFlight.add(userId);
    try {
      const server = await readServer(userId, "resolve-server", signal);
      if (server.status !== "success") return server;
      const row = server.row ?? { state: {}, version: 0 };
      setBaseline(userId, row);
      replaceLocalFromDoc(userId, row.state, storage);
      return { status: "success" };
    } catch {
      return { status: "error" };
    } finally {
      pushInFlight.delete(userId);
    }
  };

  const prepareKeepalive = (
    userId: string,
    maxBytes = MAX_KEEPALIVE_BYTES,
  ): LibraryKeepaliveRequest | null => {
    const baseline = baselines.get(userId);
    if (!userId || !baseline || divergenceFor(userId)) return null;

    const localSnapshot = snapshotLocal(userId, storage);
    const prepared = prepareForSync(localSnapshot, "keepalive");
    if (!prepared) return null;
    const localState = prepared.state;
    if (sameDoc(localState, baseline.state)) return null;

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

  return { hydrate, push, prepareKeepalive, resolveWithLocal, resolveWithServer };
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

export async function resolveLibraryConflictWithLocal(
  userId: string,
): Promise<LibrarySyncResult> {
  return (await getBrowserSync()?.resolveWithLocal(userId)) ?? { status: "error" };
}

export async function resolveLibraryConflictWithServer(
  userId: string,
): Promise<LibrarySyncResult> {
  return (await getBrowserSync()?.resolveWithServer(userId)) ?? { status: "error" };
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
