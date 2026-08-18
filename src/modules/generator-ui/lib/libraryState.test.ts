import { describe, expect, it, vi } from "vitest";
import {
  createLibraryStateSync,
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

class VersionedBackend implements LibraryStateBackend {
  row: LibraryStateRow | null;
  constructor(row: LibraryStateRow | null) {
    this.row = row ? { state: { ...row.state }, version: row.version } : null;
  }
  async read() {
    return this.row ? { state: { ...this.row.state }, version: this.row.version } : null;
  }
  async insert(_userId: string, state: LibraryDoc, version: number) {
    if (this.row) return false;
    this.row = { state: { ...state }, version };
    return true;
  }
  async updateIfVersion(
    _userId: string,
    state: LibraryDoc,
    expectedVersion: number,
    nextVersion: number,
  ) {
    if (!this.row || this.row.version !== expectedVersion) return false;
    this.row = { state: { ...state }, version: nextVersion };
    return true;
  }
}

const userId = "user-1";
const approvedKey = `approved-videos:${userId}`;
const staleKey = `draft-entries:${userId}`;

describe("library state synchronization", () => {
  it("replaces the tracked cache exactly and removes stale keys", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["server-video"]' },
      version: 4,
    });
    const storage = new MemoryStorage();
    storage.setItem(approvedKey, '["old-video"]');
    storage.setItem(staleKey, '["deleted-draft"]');

    const sync = createLibraryStateSync(backend, storage);

    await expect(sync.hydrate(userId)).resolves.toBe(true);
    expect(storage.getItem(approvedKey)).toBe('["server-video"]');
    expect(storage.getItem(staleKey)).toBeNull();
  });

  it("fails closed when hydration cannot read the server", async () => {
    const backend: LibraryStateBackend = {
      read: vi.fn().mockRejectedValue(new Error("offline")),
      insert: vi.fn(),
      updateIfVersion: vi.fn(),
    };
    const sync = createLibraryStateSync(backend, new MemoryStorage());

    await expect(sync.hydrate(userId)).resolves.toBe(false);
    await expect(sync.push(userId)).resolves.toBe(false);
  });

  it("prevents a stale second device from overwriting the first device", async () => {
    const backend = new VersionedBackend({
      state: { [approvedKey]: '["initial"]' },
      version: 1,
    });
    const deviceA = new MemoryStorage();
    const deviceB = new MemoryStorage();
    const syncA = createLibraryStateSync(backend, deviceA);
    const syncB = createLibraryStateSync(backend, deviceB);

    await expect(syncA.hydrate(userId)).resolves.toBe(true);
    await expect(syncB.hydrate(userId)).resolves.toBe(true);

    deviceA.setItem(approvedKey, '["device-a"]');
    await expect(syncA.push(userId)).resolves.toBe(true);
    expect(backend.row).toEqual({
      state: { [approvedKey]: '["device-a"]' },
      version: 2,
    });

    deviceB.setItem(approvedKey, '["device-b-stale"]');
    await expect(syncB.push(userId)).resolves.toBe(false);
    expect(backend.row).toEqual({
      state: { [approvedKey]: '["device-a"]' },
      version: 2,
    });
    expect(deviceB.getItem(approvedKey)).toBe('["device-b-stale"]');
  });
});
