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

type LibraryDoc = Record<string, string>;

function trackedKeysFor(userId: string): string[] {
  return TRACKED_PREFIXES.map((p) => `${p}:${userId}`);
}

function snapshotLocal(userId: string): LibraryDoc {
  const doc: LibraryDoc = {};
  if (typeof window === "undefined") return doc;
  for (const key of trackedKeysFor(userId)) {
    const raw = window.localStorage.getItem(key);
    if (raw != null) doc[key] = raw;
  }
  return doc;
}

function hasAnyLocal(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return trackedKeysFor(userId).some((k) => window.localStorage.getItem(k) != null);
}

function writeLocalFromDoc(userId: string, doc: LibraryDoc) {
  if (typeof window === "undefined" || !doc) return;
  const valid = new Set(trackedKeysFor(userId));
  for (const [key, value] of Object.entries(doc)) {
    if (valid.has(key) && typeof value === "string") {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* ignore quota errors */
      }
    }
  }
}

let loadedVersion = 0;

/**
 * Load server state into localStorage. If the server has nothing yet but this
 * browser already has library data (existing user), push the local data up once
 * so it isn't lost. Returns true on success.
 */
export async function hydrateLibraryFromServer(userId: string): Promise<boolean> {
  if (!userId || typeof window === "undefined") return false;
  try {
    const { data, error } = await supabase
      .from("generator_library_state")
      .select("state, version")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return false;

    if (data && data.state && Object.keys(data.state as LibraryDoc).length > 0) {
      loadedVersion = (data.version as number) ?? 0;
      writeLocalFromDoc(userId, data.state as LibraryDoc);
      return true;
    }

    // Server empty: migrate existing local data up (one-time) if present.
    if (hasAnyLocal(userId)) {
      await pushLibraryToServer(userId);
    }
    return true;
  } catch {
    return false;
  }
}

let pushInFlight = false;

/** Upsert the current localStorage snapshot to the server. */
export async function pushLibraryToServer(userId: string): Promise<void> {
  if (!userId || typeof window === "undefined" || pushInFlight) return;
  pushInFlight = true;
  try {
    const state = snapshotLocal(userId);
    const nextVersion = loadedVersion + 1;
    const { error } = await supabase
      .from("generator_library_state")
      .upsert(
        { user_id: userId, state, version: nextVersion },
        { onConflict: "user_id" },
      );
    if (!error) loadedVersion = nextVersion;
  } catch {
    /* ignore network errors; next tick retries */
  } finally {
    pushInFlight = false;
  }
}

/**
 * Start watching localStorage for library changes and push them up (debounced).
 * Returns a cleanup function. Uses lightweight snapshot diffing so the
 * dashboard's existing localStorage writes are picked up without refactoring
 * every call site.
 */
export function startLibrarySync(userId: string): () => void {
  if (!userId || typeof window === "undefined") return () => {};

  let lastSerialized = JSON.stringify(snapshotLocal(userId));
  let debounceTimer: number | undefined;

  const schedulePush = () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      void pushLibraryToServer(userId);
    }, 800);
  };

  const tick = () => {
    const serialized = JSON.stringify(snapshotLocal(userId));
    if (serialized !== lastSerialized) {
      lastSerialized = serialized;
      schedulePush();
    }
  };

  const intervalId = window.setInterval(tick, 1500);

  const flushNow = () => {
    const serialized = JSON.stringify(snapshotLocal(userId));
    if (serialized !== lastSerialized) {
      lastSerialized = serialized;
      void pushLibraryToServer(userId);
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
