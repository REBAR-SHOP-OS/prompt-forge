import { describe, expect, it, vi } from "vitest";
import {
  createLibraryStateSync,
  mergeLibraryDocs,
  type LibraryBackendResult,
  type LibraryDoc,
  type LibraryStateBackend,
  type LibraryStateRow,
} from "./libraryState";

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

describe("library state synchronization", () => {
  it("replaces the tracked cache exactly and removes stale keys", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["server-video"]' },
      version: 4,
    });
    const storage = new MemoryStorage();
    storage.setItem(approvedKey, '["old-video"]');
    storage.setItem(draftKey, '["deleted-draft"]');

    const sync = createLibraryStateSync(backend, storage);

    await expect(sync.hydrate(userId)).resolves.toEqual({ status: "success" });
    expect(storage.getItem(approvedKey)).toBe('["server-video"]');
    expect(storage.getItem(draftKey)).toBeNull();
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

  it("does not let an aborted hydration mutate local state", async () => {
    let resolveRead: (result: LibraryBackendResult<LibraryStateRow | null>) => void = () => {};
    const backend: LibraryStateBackend = {
      read: vi.fn(() => new Promise((resolve) => { resolveRead = resolve; })),
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
