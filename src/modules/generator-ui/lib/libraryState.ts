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

export interface LibraryStateBackend {
  read(userId: string): Promise<LibraryStateRow | null>;
  insert(userId: string, state: LibraryDoc, version: number): Promise<boolean>;
  updateIfVersion(
    userId: string,
    state: LibraryDoc,
    expectedVersion: number,
    nextVersion: number,
  ): Promise<boolean>;
}

type LibraryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function trackedKeysFor(userId: string): string[] {
  return TRACKED_PREFIXES.map((p) => `${p}:${userId}`);
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
  return trackedKeysFor(userId).some((k) => storage.getItem(k) != null);
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

export function createLibraryStateSync(
  backend: LibraryStateBackend,
  storage: LibraryStorage,
) {
  const loadedVersions = new Map<string, number>();
  const pushInFlight = new Set<string>();

  const hydrate = async (userId: string): Promise<boolean> => {
    if (!userId) return false;
    try {
      const row = await backend.read(userId);
      if (row) {
        replaceLocalFromDoc(userId, row.state ?? {}, storage);
        loadedVersions.set(userId, row.version ?? 0);
        return true;
      }

      const localState = snapshotLocal(userId, storage);
      if (hasAnyLocal(userId, storage)) {
        const inserted = await backend.insert(userId, localState, 1);
        if (!inserted) return false;
        loadedVersions.set(userId, 1);
      } else {
        loadedVersions.set(userId, 0);
      }
      return true;
    } catch {
      return false;
    }
  };

  const push = async (userId: string): Promise<boolean> => {
    const loadedVersion = loadedVersions.get(userId);
    if (!userId || loadedVersion === undefined || pushInFlight.has(userId)) return false;
    pushInFlight.add(userId);
    try {
      const state = snapshotLocal(userId, storage);
      const nextVersion = loadedVersion + 1;
      const saved = loadedVersion === 0
        ? await backend.insert(userId, state, nextVersion)
        : await backend.updateIfVersion(userId, state, loadedVersion, nextVersion);
      if (saved) loadedVersions.set(userId, nextVersion);
      return saved;
    } catch {
      return false;
    } finally {
      pushInFlight.delete(userId);
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
    if (error) throw error;
    if (!data) return null;
    return {
      state: (data.state as LibraryDoc | null) ?? {},
      version: (data.version as number | null) ?? 0,
    };
  },
  async insert(userId, state, version) {
    const { error } = await supabase
      .from("generator_library_state")
      .insert({ user_id: userId, state, version });
    return !error;
  },
  async updateIfVersion(userId, state, expectedVersion, nextVersion) {
    const { data, error } = await supabase
      .from("generator_library_state")
      .update({ state, version: nextVersion })
      .eq("user_id", userId)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle();
    return !error && data?.version === nextVersion;
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

/**
 * Load server state into localStorage. If the server has nothing yet but this
 * browser already has library data (existing user), insert it once. A failed
 * read or compare-and-set keeps the dashboard closed instead of allowing a
 * stale cache to become authoritative.
 */
export async function hydrateLibraryFromServer(userId: string): Promise<boolean> {
  return (await getBrowserSync()?.hydrate(userId)) ?? false;
}

/** Save the local snapshot only if the server version still matches. */
export async function pushLibraryToServer(userId: string): Promise<boolean> {
  return (await getBrowserSync()?.push(userId)) ?? false;
}

/**
 * Start watching localStorage for library changes and push them up (debounced).
 * Returns a cleanup function. Uses lightweight snapshot diffing so the
 * dashboard's existing localStorage writes are picked up without refactoring
 * every call site.
 */
export function startLibrarySync(userId: string): () => void {
  if (!userId || typeof window === "undefined") return () => {};

  let lastSerialized = JSON.stringify(snapshotLocal(userId, window.localStorage));
  let debounceTimer: number | undefined;

  const schedulePush = () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      const serialized = JSON.stringify(snapshotLocal(userId, window.localStorage));
      void pushLibraryToServer(userId).then((saved) => {
        if (saved) lastSerialized = serialized;
      });
    }, 800);
  };

  const tick = () => {
    const serialized = JSON.stringify(snapshotLocal(userId, window.localStorage));
    if (serialized !== lastSerialized) {
      schedulePush();
    }
  };

  const intervalId = window.setInterval(tick, 1500);

  const flushNow = () => {
    const serialized = JSON.stringify(snapshotLocal(userId, window.localStorage));
    if (serialized !== lastSerialized) {
      void pushLibraryToServer(userId).then((saved) => {
        if (saved) lastSerialized = serialized;
      });
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") flushNow();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("beforeunload", flushNow);

  return () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("beforeunload", flushNow);
  };
}
