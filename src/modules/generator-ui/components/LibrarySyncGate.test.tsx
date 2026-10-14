import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LibrarySyncGate from "./LibrarySyncGate";
import type {
  LibraryDoc,
  LibraryStateBackend,
  LibraryStateRow,
  LibrarySyncResult,
} from "@/modules/generator-ui/lib/libraryState";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  hydrate: vi.fn(),
  resolveLocal: vi.fn(),
  resolveServer: vi.fn(),
  hasCache: vi.fn(),
  startSync: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

vi.mock("@/core/auth/auth-context", () => ({
  useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }),
}));

vi.mock("@/core/ui/LoadingScreen", () => ({
  default: () => <div>Loading library</div>,
}));

vi.mock("@/modules/generator-ui/lib/libraryState", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/generator-ui/lib/libraryState")>()),
  hasUsableLocalLibraryCache: (...args: unknown[]) => mocks.hasCache(...args),
  hydrateLibraryFromServer: (...args: unknown[]) => mocks.hydrate(...args),
  resolveLibraryConflictWithLocal: (...args: unknown[]) => mocks.resolveLocal(...args),
  resolveLibraryConflictWithServer: (...args: unknown[]) => mocks.resolveServer(...args),
  startLibrarySync: (...args: unknown[]) => mocks.startSync(...args),
}));

const ok: LibrarySyncResult = { status: "success" };
const failed: LibrarySyncResult = { status: "error" };
const conflict: LibrarySyncResult = { status: "conflict", conflictingKeys: ["key"] };

beforeEach(() => {
  vi.useFakeTimers();
  mocks.userId = "user-1";
  mocks.hydrate.mockReset();
  mocks.resolveLocal.mockReset().mockResolvedValue(ok);
  mocks.resolveServer.mockReset().mockResolvedValue(ok);
  mocks.hasCache.mockReset().mockReturnValue(false);
  mocks.startSync.mockReset().mockReturnValue(vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LibrarySyncGate", () => {
  it("retries a transient hydration failure before mounting once", async () => {
    mocks.hydrate.mockResolvedValueOnce(failed).mockResolvedValueOnce(ok);
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);

    expect(screen.getByText("Loading library")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(mocks.hydrate).toHaveBeenCalledTimes(2);
    expect(mocks.startSync).toHaveBeenCalledTimes(1);
  });

  it("uses valid local cache when initial hydration stays offline", async () => {
    mocks.hydrate.mockResolvedValue(failed);
    mocks.hasCache.mockReturnValue(true);
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Using your saved library");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.startSync).not.toHaveBeenCalled();
  });

  it("keeps the dashboard mounted when a background push fails", async () => {
    let reportResult: ((result: LibrarySyncResult) => void) | undefined;
    mocks.hydrate.mockResolvedValue(ok);
    mocks.startSync.mockImplementation((_userId, callback) => {
      reportResult = callback;
      return vi.fn();
    });
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);
    await act(async () => {});

    act(() => reportResult?.(failed));

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("retry in the background");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps a background conflict visible without unmounting local work", async () => {
    const stop = vi.fn();
    let reportResult: ((result: LibrarySyncResult) => void) | undefined;
    mocks.hydrate.mockResolvedValue(ok);
    mocks.startSync.mockImplementation((_userId, callback) => {
      reportResult = callback;
      return stop;
    });
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);
    await act(async () => {});

    act(() => reportResult?.(conflict));

    expect(stop).not.toHaveBeenCalled();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("not overwritten");
    expect(screen.getByRole("button", { name: "Keep my work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use synced version" })).toBeInTheDocument();
  });

  it("shows a retryable error only when hydration fails without local cache", async () => {
    mocks.hydrate.mockResolvedValue(failed);
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(screen.getByRole("alert")).toHaveTextContent("no saved device cache");
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(mocks.hydrate).toHaveBeenCalledTimes(3);
    expect(mocks.startSync).not.toHaveBeenCalled();

    mocks.hydrate.mockResolvedValue(ok);
    const retry = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await act(async () => {});

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(mocks.hydrate).toHaveBeenCalledTimes(4);
    expect(mocks.startSync).toHaveBeenCalledTimes(1);
  });

  it("makes an old user hydration ineffective after a user change", async () => {
    let resolveOld: (result: LibrarySyncResult) => void = () => {};
    mocks.hydrate.mockImplementation((userId: string) => {
      if (userId === "user-1") {
        return new Promise<LibrarySyncResult>((resolve) => { resolveOld = resolve; });
      }
      return Promise.resolve(ok);
    });
    const view = render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);

    mocks.userId = "user-2";
    view.rerender(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);
    await act(async () => {});
    expect(screen.getByText("Dashboard")).toBeInTheDocument();

    await act(async () => { resolveOld(ok); });
    expect(mocks.startSync).toHaveBeenCalledTimes(1);
    expect(mocks.startSync).toHaveBeenCalledWith("user-2", expect.any(Function));
  });

  it("does not start sync after unmount while hydration is pending", async () => {
    let resolveHydration: (result: LibrarySyncResult) => void = () => {};
    mocks.hydrate.mockReturnValue(new Promise<LibrarySyncResult>((resolve) => {
      resolveHydration = resolve;
    }));
    const view = render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);

    view.unmount();
    await act(async () => { resolveHydration(ok); });

    expect(mocks.startSync).not.toHaveBeenCalled();
  });

  it("surfaces a load-time conflict for an explicit decision instead of resolving it automatically", async () => {
    mocks.hasCache.mockReturnValue(true);
    mocks.hydrate.mockResolvedValue(conflict);
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);

    await act(async () => {});

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Library changes need review. Your local work was not overwritten.",
    );
    expect(mocks.hydrate).toHaveBeenCalledTimes(1);
    expect(mocks.resolveLocal).not.toHaveBeenCalled();
    expect(mocks.resolveServer).not.toHaveBeenCalled();
    expect(mocks.startSync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Keep my work" }));
    await act(async () => {});

    expect(mocks.resolveLocal).toHaveBeenCalledWith("user-1");
    expect(mocks.resolveServer).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mocks.startSync).toHaveBeenCalledTimes(1);
  });

  it("keeps preserved local work mounted across a reload until the user chooses the synced version", async () => {
    mocks.hasCache.mockReturnValue(true);
    mocks.hydrate.mockResolvedValue(conflict);

    const first = render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);
    await act(async () => {});

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("not overwritten");
    expect(mocks.startSync).not.toHaveBeenCalled();
    first.unmount();

    // Reload: the gate mounts again from the same saved library, still
    // conflicted; nothing is resolved until the user decides.
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);
    await act(async () => {});

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("not overwritten");
    expect(mocks.resolveServer).not.toHaveBeenCalled();
    expect(mocks.hydrate).toHaveBeenCalledWith("user-1", expect.anything(), true);

    fireEvent.click(screen.getByRole("button", { name: "Use synced version" }));
    await act(async () => {});

    expect(mocks.resolveServer).toHaveBeenCalledWith("user-1");
    expect(mocks.resolveLocal).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mocks.startSync).toHaveBeenCalledTimes(1);
  });

  it("re-arms the connection retry when a conflict resolution fails offline", async () => {
    const addListener = vi.spyOn(window, "addEventListener");
    const removeListener = vi.spyOn(window, "removeEventListener");
    mocks.hasCache.mockReturnValue(true);
    mocks.hydrate.mockResolvedValue(conflict);
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);
    await act(async () => {});

    mocks.resolveLocal.mockResolvedValue(failed);
    fireEvent.click(screen.getByRole("button", { name: "Keep my work" }));
    await act(async () => {});

    expect(screen.getByRole("status")).toHaveTextContent("connection returns");
    expect(screen.getByRole("button", { name: "Retry sync" })).toBeInTheDocument();
    expect(addListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(mocks.startSync).not.toHaveBeenCalled();

    // Connection returns: the resolution is retried as a recovery hydration,
    // never as a push of the local document.
    mocks.hydrate.mockClear().mockResolvedValue(ok);
    window.dispatchEvent(new Event("online"));
    await act(async () => {});

    expect(mocks.hydrate).toHaveBeenCalledTimes(1);
    expect(mocks.hydrate).toHaveBeenCalledWith("user-1", expect.anything(), true);
    expect(mocks.startSync).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(removeListener).toHaveBeenCalledWith("online", expect.any(Function));

    // Resolved: the listener is gone, so later online events do nothing.
    window.dispatchEvent(new Event("online"));
    await act(async () => {});
    expect(mocks.hydrate).toHaveBeenCalledTimes(1);

    addListener.mockRestore();
    removeListener.mockRestore();
  });

  it("does not overwrite newer server work from an unchanged stale cache", async () => {
    const { createLibraryStateSync } = await vi.importActual<
      typeof import("@/modules/generator-ui/lib/libraryState")
    >("@/modules/generator-ui/lib/libraryState");
    const approvedKey = "approved-videos:user-1";
    const draftKey = "draft-entries:user-1";
    let row: LibraryStateRow | null = {
      state: { [approvedKey]: '["initial"]', [draftKey]: '["initial-draft"]' },
      version: 1,
    };
    let writes = 0;
    const backend: LibraryStateBackend = {
      read: async () => ({
        status: "success",
        value: row ? { state: { ...row.state }, version: row.version } : null,
      }),
      insert: async (_userId: string, state: LibraryDoc, version: number) => {
        writes += 1;
        if (row) return { status: "conflict" };
        row = { state: { ...state }, version };
        return { status: "success", value: undefined };
      },
      updateIfVersion: async (_userId: string, state: LibraryDoc, expected: number, next: number) => {
        writes += 1;
        if (!row || row.version !== expected) return { status: "conflict" };
        row = { state: { ...state }, version: next };
        return { status: "success", value: undefined };
      },
    };
    const values = new Map<string, string>();
    const deviceA = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };

    // Device A syncs once, then device B saves newer work to the server.
    await createLibraryStateSync(backend, deviceA).hydrate("user-1");
    row = {
      state: { [approvedKey]: '["device-b"]', [draftKey]: '["device-b-draft"]' },
      version: 2,
    };
    const serverAfterB = structuredClone(row);
    writes = 0;

    // Device A reopens with its unchanged, stale cache.
    const reopened = createLibraryStateSync(backend, deviceA);
    mocks.hasCache.mockReturnValue(true);
    mocks.hydrate.mockImplementation(
      (userId: string, signal?: AbortSignal, preserveLocal?: boolean) =>
        reopened.hydrate(userId, signal, preserveLocal),
    );
    mocks.resolveLocal.mockImplementation((userId: string) => reopened.resolveWithLocal(userId));
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);
    await act(async () => {});

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mocks.resolveLocal).not.toHaveBeenCalled();
    expect(writes).toBe(0);
    expect(row).toEqual(serverAfterB);
    expect(deviceA.getItem(approvedKey)).toBe('["device-b"]');
    expect(deviceA.getItem(draftKey)).toBe('["device-b-draft"]');
  });

  it("recovers sync when connectivity returns after background retries are exhausted", async () => {
    mocks.hasCache.mockReturnValue(true);
    mocks.hydrate.mockResolvedValue(failed);
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);

    // Initial attempts (0ms, +500ms, +1.5s) plus background recovery
    // attempts (+2s, +5s, +15s) all fail.
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(mocks.startSync).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("connection returns");
    expect(screen.getByRole("button", { name: "Retry sync" })).toBeInTheDocument();

    mocks.hydrate.mockResolvedValue(ok);
    window.dispatchEvent(new Event("online"));
    await act(async () => {});

    expect(mocks.startSync).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
