import { describe, expect, it, vi } from "vitest";
import {
  createLibraryStateSync,
  mergeLibraryDocs,
  sendLibraryKeepaliveRequest,
  type LibraryBackendResult,
  type LibraryDoc,
  type LibraryStateBackend,
  type LibraryStateRow,
} from "./libraryState";
import {
  compactLibraryDocument,
  MAX_LIBRARY_STATE_BYTES,
} from "./libraryStateCompaction";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const success = <T>(value: T): LibraryBackendResult<T> => ({ status: "success", value });

class VersionedBackend implements LibraryStateBackend {
  row: LibraryStateRow | null;
  readCount = 0;
  insertCount = 0;
  updateCount = 0;

  constructor(row: LibraryStateRow | null) {
    this.row = row ? { state: { ...row.state }, version: row.version } : null;
  }

  async read() {
    this.readCount += 1;
    return success(this.row ? { state: { ...this.row.state }, version: this.row.version } : null);
  }

  async insert(_userId: string, state: LibraryDoc, version: number) {
    this.insertCount += 1;
    if (this.row) return { status: "conflict" } as const;
    this.row = { state: { ...state }, version };
    return success(undefined);
  }

  async updateIfVersion(
    _userId: string,
    state: LibraryDoc,
    expectedVersion: number,
    nextVersion: number,
  ) {
    this.updateCount += 1;
    if (!this.row || this.row.version !== expectedVersion) {
      return { status: "conflict" } as const;
    }
    this.row = { state: { ...state }, version: nextVersion };
    return success(undefined);
  }
}

const userId = "user-1";
const approvedKey = `approved-videos:${userId}`;
const draftKey = `draft-entries:${userId}`;
const mergedKey = `merged-videos:${userId}`;
const coverDurationsKey = `project-cover-durations:${userId}`;


describe("library state compaction", () => {
  it("removes a large Base64 thumbnail while preserving film metadata and storage reference", () => {
    const raw = JSON.stringify([{
      id: "film-1",
      input_prompt: "Final Film",
      video: {
        storage_path: "merged-videos/user-1/film.mp4",
        thumbnail_url: `data:image/jpeg;base64,${"A".repeat(700_000)}`,
      },
    }]);

    const result = compactLibraryDocument({ [mergedKey]: raw });
    const films = JSON.parse(result.state[mergedKey]);

    expect(result.withinBudget).toBe(true);
    expect(result.byteSize).toBeLessThan(MAX_LIBRARY_STATE_BYTES);
    expect(films[0]).toMatchObject({
      id: "film-1",
      input_prompt: "Final Film",
      video: {
        storage_path: "merged-videos/user-1/film.mp4",
        thumbnail_url: null,
      },
    });
  });

  it("keeps metadata and uses a safe placeholder when no durable thumbnail reference exists", () => {
    const result = compactLibraryDocument({
      [draftKey]: JSON.stringify([{
        id: "draft-1",
        input_prompt: "Keep this project",
        video: { storage_path: "", thumbnail_url: "data:image/png;base64,AAAA" },
      }]),
    });
    const drafts = JSON.parse(result.state[draftKey]);

    expect(drafts[0].id).toBe("draft-1");
    expect(drafts[0].input_prompt).toBe("Keep this project");
    expect(drafts[0].video.thumbnail_url).toBeNull();
  });

  it("applies the same inline-image contract across every tracked document shape", () => {
    const result = compactLibraryDocument({
      [`project-source-jobs:${userId}`]: JSON.stringify({
        "film-1": [{ id: "clip-1", video: { thumbnail_url: "data:image/png;base64,AAAA" } }],
      }),
      [`project-source-images:${userId}`]: JSON.stringify({
        "film-1": [{ id: "image-1", storage_path: "data:image/png;base64,BBBB" }],
      }),
    });

    expect(JSON.stringify(result.state)).not.toContain("data:image");
    expect(JSON.parse(result.state[`project-source-jobs:${userId}`])["film-1"][0].id)
      .toBe("clip-1");
    expect(JSON.parse(result.state[`project-source-images:${userId}`])["film-1"][0].id)
      .toBe("image-1");
  });

  it("drops only cacheable state when metadata fits within the budget", () => {
    const manualOrderKey = `manual-card-order:${userId}`;
    const result = compactLibraryDocument({
      [mergedKey]: JSON.stringify([{ id: "film-1" }]),
      [manualOrderKey]: JSON.stringify({ library: ["film-1"] }),
      [`preview-state:${userId}`]: JSON.stringify({ cache: "x".repeat(MAX_LIBRARY_STATE_BYTES) }),
    });

    expect(result.withinBudget).toBe(true);
    expect(result.state[mergedKey]).toBeDefined();
    expect(result.state[manualOrderKey]).toBeDefined();
    expect(result.state[`preview-state:${userId}`]).toBeUndefined();
  });

  it("preserves durable thumbnail URLs and is idempotent", () => {
    const document = {
      [mergedKey]: JSON.stringify([{
        id: "film-1",
        video: {
          storage_path: "merged-videos/user-1/film.mp4",
          thumbnail_url: "merged-videos/user-1/posters/film-1.jpg",
        },
      }]),
    };

    const first = compactLibraryDocument(document);
    const second = compactLibraryDocument(first.state);

    expect(JSON.parse(first.state[mergedKey])[0].video.thumbnail_url)
      .toBe("merged-videos/user-1/posters/film-1.jpg");
    expect(second.state).toEqual(first.state);
    expect(second.changed).toBe(false);
  });

  it("compacts legacy server state through CAS during hydration", async () => {
    const backend = new VersionedBackend({
      state: {
        [mergedKey]: JSON.stringify([{
          id: "film-1",
          video: {
            storage_path: "merged-videos/user-1/film.mp4",
            thumbnail_url: `data:image/jpeg;base64,${"A".repeat(700_000)}`,
          },
        }]),
      },
      version: 3,
    });
    const storage = new MemoryStorage();
    const sync = createLibraryStateSync(backend, storage);

    await expect(sync.hydrate(userId)).resolves.toEqual({ status: "success" });

    expect(backend.updateCount).toBe(1);
    expect(backend.row?.version).toBe(4);
    expect(JSON.stringify(backend.row?.state)).not.toContain("data:image");
    expect(storage.getItem(mergedKey)).not.toContain("data:image");
  });

  it("never sends a still-oversized state to sync or keepalive", async () => {
    const backend = new VersionedBackend({ state: {}, version: 2 });
    const storage = new MemoryStorage();
    const sync = createLibraryStateSync(backend, storage);
    await sync.hydrate(userId);
    storage.setItem(approvedKey, "x".repeat(MAX_LIBRARY_STATE_BYTES + 1));

    await expect(sync.push(userId)).resolves.toEqual({ status: "error" });
    expect(sync.prepareKeepalive(userId)).toBeNull();
    expect(backend.updateCount).toBe(0);
  });
});

describe("library state synchronization", () => {
  it("replaces the tracked cache exactly and removes stale keys", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["server-video"]' },
      version: 4,
    });
    const storage = new MemoryStorage();
    storage.setItem(coverDurationsKey, '{"merged-a":8}');
    storage.setItem(approvedKey, '["old-video"]');
    storage.setItem(draftKey, '["deleted-draft"]');

    const sync = createLibraryStateSync(backend, storage);

    await expect(sync.hydrate(userId)).resolves.toEqual({ status: "success" });
    expect(storage.getItem(approvedKey)).toBe('["server-video"]');
    expect(storage.getItem(draftKey)).toBeNull();
    // Device-only keys are NOT tracked, so hydrate must leave them alone. Cover
    // durations were briefly tracked (#270); every existing server row predates
    // that key, so tracking it wiped each user's durations on first load.
    expect(storage.getItem(coverDurationsKey)).toBe('{"merged-a":8}');
  });

  it("fails closed when hydration cannot read the server", async () => {
    const backend: LibraryStateBackend = {
      read: vi.fn().mockResolvedValue({ status: "error" }),
      insert: vi.fn(),
      updateIfVersion: vi.fn(),
    };
    const sync = createLibraryStateSync(backend, new MemoryStorage());

    await expect(sync.hydrate(userId)).resolves.toEqual({ status: "error" });
    await expect(sync.push(userId)).resolves.toEqual({ status: "error" });
    expect(backend.insert).not.toHaveBeenCalled();
    expect(backend.updateIfVersion).not.toHaveBeenCalled();
  });

  it("combines independent changes from two devices and CASes the merge once", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["initial"]', [draftKey]: '["initial-draft"]' },
      version: 1,
    });
    const deviceA = new MemoryStorage();
    const deviceB = new MemoryStorage();
    const syncA = createLibraryStateSync(backend, deviceA);
    const syncB = createLibraryStateSync(backend, deviceB);

    await syncA.hydrate(userId);
    await syncB.hydrate(userId);
    deviceA.setItem(approvedKey, '["device-a"]');
    await expect(syncA.push(userId)).resolves.toEqual({ status: "success" });

    deviceB.setItem(draftKey, '["device-b-draft"]');
    const updatesBeforeConflict = backend.updateCount;
    await expect(syncB.push(userId)).resolves.toEqual({ status: "success" });

    expect(backend.updateCount - updatesBeforeConflict).toBe(2);
    expect(backend.row).toEqual({
      state: {
        [approvedKey]: '["device-a"]',
        [draftKey]: '["device-b-draft"]',
      },
      version: 3,
    });
    expect(deviceB.getItem(approvedKey)).toBe('["device-a"]');
  });

  it("treats deletion as a change and combines it with an independent edit", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["initial"]', [draftKey]: '["delete-me"]' },
      version: 1,
    });
    const deviceA = new MemoryStorage();
    const deviceB = new MemoryStorage();
    const syncA = createLibraryStateSync(backend, deviceA);
    const syncB = createLibraryStateSync(backend, deviceB);

    await syncA.hydrate(userId);
    await syncB.hydrate(userId);
    deviceA.removeItem(draftKey);
    await syncA.push(userId);
    deviceB.setItem(approvedKey, '["device-b"]');

    await expect(syncB.push(userId)).resolves.toEqual({ status: "success" });
    expect(backend.row).toEqual({
      state: { [approvedKey]: '["device-b"]' },
      version: 3,
    });
    expect(deviceB.getItem(draftKey)).toBeNull();
  });

  it("keeps same-key divergence visible without overwriting server or local", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["initial"]' },
      version: 1,
    });
    const deviceA = new MemoryStorage();
    const deviceB = new MemoryStorage();
    const syncA = createLibraryStateSync(backend, deviceA);
    const syncB = createLibraryStateSync(backend, deviceB);

    await syncA.hydrate(userId);
    await syncB.hydrate(userId);
    deviceA.setItem(approvedKey, '["device-a"]');
    await syncA.push(userId);
    deviceB.setItem(approvedKey, '["device-b"]');

    const updatesBeforeConflict = backend.updateCount;
    await expect(syncB.push(userId)).resolves.toEqual({
      status: "conflict",
      conflictingKeys: [approvedKey],
    });
    expect(backend.updateCount - updatesBeforeConflict).toBe(1);
    expect(backend.row).toEqual({
      state: { [approvedKey]: '["device-a"]' },
      version: 2,
    });
    expect(deviceB.getItem(approvedKey)).toBe('["device-b"]');
  });

  it("does not overwrite a newer local edit that lands during conflict reconciliation", async () => {
    const backend = new VersionedBackend({
      state: {
        [approvedKey]: '["initial"]',
        [draftKey]: '["initial-draft"]',
      },
      version: 1,
    });
    const storage = new MemoryStorage();
    const sync = createLibraryStateSync(backend, storage);
    await sync.hydrate(userId);

    backend.row = {
      state: {
        [approvedKey]: '["initial"]',
        [draftKey]: '["server-draft"]',
      },
      version: 2,
    };
    storage.setItem(approvedKey, '["local-edit"]');

    const update = backend.updateIfVersion.bind(backend);
    vi.spyOn(backend, "updateIfVersion").mockImplementation(async (...args) => {
      const result = await update(...args);
      if (args[2] === 2 && result.status === "success") {
        storage.setItem(approvedKey, '["newer-local-edit"]');
      }
      return result;
    });

    await expect(sync.push(userId)).resolves.toEqual({ status: "success" });
    expect(storage.getItem(approvedKey)).toBe('["newer-local-edit"]');
    expect(storage.getItem(draftKey)).toBe('["server-draft"]');
    expect(JSON.parse(backend.row?.state[approvedKey] ?? "null")).toEqual(["local-edit"]);
    expect(JSON.parse(backend.row?.state[draftKey] ?? "null")).toEqual(["server-draft"]);

    await expect(sync.push(userId)).resolves.toEqual({ status: "success" });
    expect(JSON.parse(backend.row?.state[approvedKey] ?? "null")).toEqual(["newer-local-edit"]);
    expect(JSON.parse(backend.row?.state[draftKey] ?? "null")).toEqual(["server-draft"]);
  });

  it("deduplicates an in-flight push and recovers on the next explicit push", async () => {
    let resolveFirstUpdate: (result: LibraryBackendResult<void>) => void = () => {};
    const backend: LibraryStateBackend = {
      read: vi.fn().mockResolvedValue(success({
        state: { [approvedKey]: '["initial"]' },
        version: 1,
      })),
      insert: vi.fn(),
      updateIfVersion: vi.fn()
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstUpdate = resolve; }))
        .mockResolvedValueOnce(success(undefined)),
    };
    const storage = new MemoryStorage();
    const sync = createLibraryStateSync(backend, storage);
    await sync.hydrate(userId);
    storage.setItem(approvedKey, '["changed"]');

    const firstPush = sync.push(userId);
    await expect(sync.push(userId)).resolves.toEqual({ status: "error" });
    expect(backend.updateIfVersion).toHaveBeenCalledTimes(1);

    resolveFirstUpdate({ status: "error" });
    await expect(firstPush).resolves.toEqual({ status: "error" });
    await expect(sync.push(userId)).resolves.toEqual({ status: "success" });
    expect(backend.updateIfVersion).toHaveBeenCalledTimes(2);
  });

  it("treats equivalent local and server documents as equal regardless of key order", async () => {
    const backend = new VersionedBackend({
      state: {
        [draftKey]: '["same-draft"]',
        [approvedKey]: '["same-video"]',
      },
      version: 3,
    });
    const storage = new MemoryStorage();
    storage.setItem(approvedKey, '["same-video"]');
    storage.setItem(draftKey, '["same-draft"]');
    const sync = createLibraryStateSync(backend, storage);

    await expect(sync.hydrate(userId, undefined, true)).resolves.toEqual({ status: "success" });
    expect(sync.prepareKeepalive(userId)).toBeNull();
  });

  it("ignores legacy untracked server keys during recovery and preserves device-only local data", async () => {
    const backend = new VersionedBackend({
      state: {
        [approvedKey]: '["same-video"]',
        [coverDurationsKey]: '{"server":4}',
      },
      version: 3,
    });
    const storage = new MemoryStorage();
    storage.setItem(approvedKey, '["same-video"]');
    storage.setItem(coverDurationsKey, '{"device":8}');
    const sync = createLibraryStateSync(backend, storage);

    await expect(sync.hydrate(userId, undefined, true)).resolves.toEqual({ status: "success" });
    expect(storage.getItem(coverDurationsKey)).toBe('{"device":8}');
    expect(sync.prepareKeepalive(userId)).toBeNull();
  });

  it("reports a recovery conflict instead of overwriting local work created while offline", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["server"]' },
      version: 4,
    });
    const storage = new MemoryStorage();
    storage.setItem(approvedKey, '["offline-local-edit"]');
    const sync = createLibraryStateSync(backend, storage);

    await expect(sync.hydrate(userId, undefined, true)).resolves.toEqual({
      status: "conflict",
      conflictingKeys: [approvedKey],
    });
    expect(storage.getItem(approvedKey)).toBe('["offline-local-edit"]');
    expect(backend.updateCount).toBe(0);
  });

  it("reconciles preserved local edits against newer server state using the persisted baseline", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["initial"]', [draftKey]: '["initial-draft"]' },
      version: 1,
    });
    const deviceA = new MemoryStorage();
    const deviceB = new MemoryStorage();
    await createLibraryStateSync(backend, deviceA).hydrate(userId);
    const syncB = createLibraryStateSync(backend, deviceB);
    await syncB.hydrate(userId);

    // Device A edits while offline; device B saves a disjoint edit meanwhile.
    deviceA.setItem(approvedKey, '["device-a"]');
    deviceB.setItem(draftKey, '["device-b-draft"]');
    await expect(syncB.push(userId)).resolves.toEqual({ status: "success" });

    // Device A reloads: a new sync instance with only the persisted baseline.
    const reloaded = createLibraryStateSync(backend, deviceA);
    await expect(reloaded.hydrate(userId, undefined, true)).resolves.toEqual({ status: "success" });

    expect(backend.row).toEqual({
      state: { [approvedKey]: '["device-a"]', [draftKey]: '["device-b-draft"]' },
      version: 3,
    });
    expect(deviceA.getItem(approvedKey)).toBe('["device-a"]');
    expect(deviceA.getItem(draftKey)).toBe('["device-b-draft"]');
  });

  it("takes the newer server state when the saved cache is simply stale", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["initial"]', [draftKey]: '["initial-draft"]' },
      version: 1,
    });
    const deviceA = new MemoryStorage();
    const deviceB = new MemoryStorage();
    await createLibraryStateSync(backend, deviceA).hydrate(userId);
    const syncB = createLibraryStateSync(backend, deviceB);
    await syncB.hydrate(userId);
    deviceB.setItem(approvedKey, '["device-b"]');
    deviceB.removeItem(draftKey);
    await syncB.push(userId);
    const serverAfterB = structuredClone(backend.row);

    // Device A reopens with its unchanged, now stale, cache.
    const reloaded = createLibraryStateSync(backend, deviceA);
    const updatesBefore = backend.updateCount;
    const insertsBefore = backend.insertCount;
    await expect(reloaded.hydrate(userId, undefined, true)).resolves.toEqual({ status: "success" });

    expect(backend.updateCount).toBe(updatesBefore);
    expect(backend.insertCount).toBe(insertsBefore);
    expect(backend.row).toEqual(serverAfterB);
    expect(deviceA.getItem(approvedKey)).toBe('["device-b"]');
    expect(deviceA.getItem(draftKey)).toBeNull();

    // Pushing afterwards has nothing stale left to write over device B's work.
    await expect(reloaded.push(userId)).resolves.toEqual({ status: "success" });
    expect(JSON.parse(backend.row?.state[approvedKey] ?? "null")).toEqual(["device-b"]);
    expect(backend.row?.state[draftKey]).toBeUndefined();
  });

  it("keeps same-key divergence a visible conflict until the user keeps the local copy", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["initial"]', [draftKey]: '["initial-draft"]' },
      version: 1,
    });
    const deviceA = new MemoryStorage();
    const deviceB = new MemoryStorage();
    await createLibraryStateSync(backend, deviceA).hydrate(userId);
    const syncB = createLibraryStateSync(backend, deviceB);
    await syncB.hydrate(userId);
    deviceA.setItem(approvedKey, '["device-a"]');
    deviceB.setItem(approvedKey, '["device-b"]');
    deviceB.setItem(draftKey, '["device-b-draft"]');
    await syncB.push(userId);

    const reloaded = createLibraryStateSync(backend, deviceA);
    const conflict = { status: "conflict", conflictingKeys: [approvedKey] };
    await expect(reloaded.hydrate(userId, undefined, true)).resolves.toEqual(conflict);
    const writesBefore = backend.updateCount + backend.insertCount;

    // Nothing writes while the divergence is unresolved, not even a push, and
    // a later non-recovery hydration does not replace the local work.
    await expect(reloaded.push(userId)).resolves.toEqual(conflict);
    const afterReload = createLibraryStateSync(backend, deviceA);
    await expect(afterReload.hydrate(userId)).resolves.toEqual(conflict);
    expect(backend.updateCount + backend.insertCount).toBe(writesBefore);
    expect(backend.row?.state[approvedKey]).toBe('["device-b"]');
    expect(deviceA.getItem(approvedKey)).toBe('["device-a"]');

    // Keeping the local copy wins the conflicting key; device B's
    // non-conflicting draft change survives.
    await expect(afterReload.resolveWithLocal(userId)).resolves.toEqual({ status: "success" });
    expect(backend.row).toEqual({
      state: { [approvedKey]: '["device-a"]', [draftKey]: '["device-b-draft"]' },
      version: 3,
    });
    expect(deviceA.getItem(approvedKey)).toBe('["device-a"]');
    expect(deviceA.getItem(draftKey)).toBe('["device-b-draft"]');

    deviceA.setItem(draftKey, '["after-resolution"]');
    await expect(afterReload.push(userId)).resolves.toEqual({ status: "success" });
    expect(backend.row?.version).toBe(4);
  });

  it("discards the diverged local copy only on an explicit use-synced resolution", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["initial"]' },
      version: 1,
    });
    const deviceA = new MemoryStorage();
    const deviceB = new MemoryStorage();
    await createLibraryStateSync(backend, deviceA).hydrate(userId);
    const syncB = createLibraryStateSync(backend, deviceB);
    await syncB.hydrate(userId);
    deviceA.setItem(approvedKey, '["device-a"]');
    deviceB.setItem(approvedKey, '["device-b"]');
    await syncB.push(userId);
    const serverAfterB = structuredClone(backend.row);

    const reloaded = createLibraryStateSync(backend, deviceA);
    const conflict = { status: "conflict", conflictingKeys: [approvedKey] };
    await expect(reloaded.hydrate(userId, undefined, true)).resolves.toEqual(conflict);
    // Retrying the recovery does not discard anything either.
    await expect(reloaded.hydrate(userId, undefined, true)).resolves.toEqual(conflict);
    expect(deviceA.getItem(approvedKey)).toBe('["device-a"]');

    const writesBefore = backend.updateCount + backend.insertCount;
    await expect(reloaded.resolveWithServer(userId)).resolves.toEqual({ status: "success" });
    expect(deviceA.getItem(approvedKey)).toBe('["device-b"]');
    expect(backend.row).toEqual(serverAfterB);
    expect(backend.updateCount + backend.insertCount).toBe(writesBefore);

    // Resolved: normal syncing resumes from the adopted server state.
    deviceA.setItem(approvedKey, '["device-a-next"]');
    await expect(reloaded.push(userId)).resolves.toEqual({ status: "success" });
    expect(backend.row?.state[approvedKey]).toBe('["device-a-next"]');
  });

  it("never fabricates a baseline for diverged work that predates any recorded sync", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["server"]' },
      version: 4,
    });
    const storage = new MemoryStorage();
    storage.setItem(approvedKey, '["offline-local-edit"]');
    const conflict = { status: "conflict", conflictingKeys: [approvedKey] };

    const firstSession = createLibraryStateSync(backend, storage);
    await expect(firstSession.hydrate(userId, undefined, true)).resolves.toEqual(conflict);
    await expect(firstSession.push(userId)).resolves.toEqual(conflict);
    expect(firstSession.prepareKeepalive(userId)).toBeNull();

    // A reload, even one that does not ask to preserve local data, keeps the
    // diverged work and the conflict; it neither adopts nor overwrites.
    const reloaded = createLibraryStateSync(backend, storage);
    await expect(reloaded.hydrate(userId)).resolves.toEqual(conflict);
    await expect(reloaded.hydrate(userId, undefined, true)).resolves.toEqual(conflict);
    await expect(reloaded.push(userId)).resolves.toEqual(conflict);

    expect(storage.getItem(approvedKey)).toBe('["offline-local-edit"]');
    expect(storage.getItem(`library-baseline:${userId}`)).toBeNull();
    expect(backend.row).toEqual({ state: { [approvedKey]: '["server"]' }, version: 4 });
    expect(backend.updateCount).toBe(0);
    expect(backend.insertCount).toBe(0);
  });

  it("persists the agreed baseline device-locally without syncing it", async () => {
    const backend = new VersionedBackend({ state: { [approvedKey]: '["initial"]' }, version: 1 });
    const storage = new MemoryStorage();
    const sync = createLibraryStateSync(backend, storage);
    await sync.hydrate(userId);
    storage.setItem(approvedKey, '["changed"]');
    await sync.push(userId);

    expect(JSON.parse(storage.getItem(`library-baseline:${userId}`) ?? "null")).toEqual({
      state: { [approvedKey]: '["changed"]' },
      version: 2,
    });
    expect(Object.keys(backend.row?.state ?? {})).toEqual([approvedKey]);
  });

  it("keeps merged server changes safe when a local edit during reconciliation conflicts with them", async () => {
    const backend = new VersionedBackend({
      state: {
        [approvedKey]: '["initial"]',
        [draftKey]: '["initial-draft"]',
        [mergedKey]: '["initial-film"]',
      },
      version: 1,
    });
    const storage = new MemoryStorage();
    const sync = createLibraryStateSync(backend, storage);
    await sync.hydrate(userId);

    // Another device advances the server: draft and merged-film keys change.
    backend.row = {
      state: {
        [approvedKey]: '["initial"]',
        [draftKey]: '["server-draft"]',
        [mergedKey]: '["server-film"]',
      },
      version: 2,
    };
    storage.setItem(approvedKey, '["local-edit"]');

    // During the reconciliation CAS, a newer local edit lands on the key the
    // server also changed, so rebasing it onto the merged state conflicts.
    const update = backend.updateIfVersion.bind(backend);
    vi.spyOn(backend, "updateIfVersion").mockImplementation(async (...args) => {
      const result = await update(...args);
      if (args[2] === 2 && result.status === "success") {
        storage.setItem(draftKey, '["racing-local-draft"]');
      }
      return result;
    });

    await expect(sync.push(userId)).resolves.toEqual({
      status: "conflict",
      conflictingKeys: [draftKey],
    });
    // The reconciliation CAS landed: the server holds the merged state.
    expect(JSON.parse(backend.row?.state[mergedKey] ?? "null")).toEqual(["server-film"]);
    // The racing local edit is preserved untouched.
    expect(storage.getItem(draftKey)).toBe('["racing-local-draft"]');

    // The next push must reconcile against the merged server state, never
    // overwrite it with the stale local document: the merged-film change
    // survives and the conflict stays visible.
    await expect(sync.push(userId)).resolves.toEqual({
      status: "conflict",
      conflictingKeys: [draftKey],
    });
    expect(JSON.parse(backend.row?.state[mergedKey] ?? "null")).toEqual(["server-film"]);
    expect(JSON.parse(backend.row?.state[draftKey] ?? "null")).toEqual(["server-draft"]);
    expect(JSON.parse(backend.row?.state[approvedKey] ?? "null")).toEqual(["local-edit"]);
  });

  it("does not let an aborted hydration mutate local state", async () => {
    let resolveRead: (result: LibraryBackendResult<LibraryStateRow | null>) => void = () => {};
    const backend: LibraryStateBackend = {
      read: vi.fn(() => new Promise<LibraryBackendResult<LibraryStateRow | null>>((resolve) => { resolveRead = resolve; })),
      insert: vi.fn(),
      updateIfVersion: vi.fn(),
    };
    const storage = new MemoryStorage();
    storage.setItem(approvedKey, '["local"]');
    const sync = createLibraryStateSync(backend, storage);
    const controller = new AbortController();

    const hydration = sync.hydrate(userId, controller.signal);
    controller.abort();
    resolveRead(success({ state: { [approvedKey]: '["server"]' }, version: 2 }));

    await expect(hydration).resolves.toEqual({ status: "error" });
    expect(storage.getItem(approvedKey)).toBe('["local"]');
  });
});

describe("mergeLibraryDocs", () => {
  it("recognizes matching deletions as the same change", () => {
    expect(mergeLibraryDocs(
      userId,
      { [approvedKey]: '["initial"]' },
      {},
      {},
    )).toEqual({ state: {}, conflictingKeys: [] });
  });
});

describe("unload keepalive persistence", () => {
  it("builds a bounded compare-and-swap request from the current local snapshot", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["initial"]' },
      version: 7,
    });
    const storage = new MemoryStorage();
    const sync = createLibraryStateSync(backend, storage);
    await sync.hydrate(userId);
    storage.setItem(approvedKey, '["changed-before-unload"]');

    const request = sync.prepareKeepalive(userId);

    expect(request).toEqual({
      method: "PATCH",
      query: `?user_id=eq.${userId}&version=eq.7`,
      body: JSON.stringify({
        state: { [approvedKey]: '["changed-before-unload"]' },
        version: 8,
      }),
    });
  });

  it("rejects an oversized keepalive payload so the normal push can retry", async () => {
    const backend = new VersionedBackend({ state: {}, version: 2 });
    const storage = new MemoryStorage();
    const sync = createLibraryStateSync(backend, storage);
    await sync.hydrate(userId);
    storage.setItem(approvedKey, "x".repeat(256));

    expect(sync.prepareKeepalive(userId, 64)).toBeNull();
  });

  it("dispatches an authenticated keepalive fetch without exposing the token in the URL", () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const request = {
      method: "PATCH" as const,
      query: `?user_id=eq.${userId}&version=eq.3`,
      body: '{"state":{},"version":4}',
    };

    expect(sendLibraryKeepaliveRequest(
      request,
      "session-token",
      { supabaseUrl: "https://project.supabase.co", supabaseKey: "public-key" },
      fetchImpl,
    )).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://project.supabase.co/rest/v1/generator_library_state${request.query}`,
      expect.objectContaining({
        method: "PATCH",
        keepalive: true,
        headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
      }),
    );
    expect(fetchImpl.mock.calls[0]?.[0]).not.toContain("session-token");
  });
});
