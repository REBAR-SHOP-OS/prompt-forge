import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LibrarySyncGate from "./LibrarySyncGate";
import type { LibrarySyncResult } from "@/modules/generator-ui/lib/libraryState";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  hydrate: vi.fn(),
  hasCache: vi.fn(),
  startSync: vi.fn(),
}));

vi.mock("@/core/auth/auth-context", () => ({
  useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }),
}));

vi.mock("@/core/ui/LoadingScreen", () => ({
  default: () => <div>Loading library</div>,
}));

vi.mock("@/modules/generator-ui/lib/libraryState", () => ({
  hasUsableLocalLibraryCache: (...args: unknown[]) => mocks.hasCache(...args),
  hydrateLibraryFromServer: (...args: unknown[]) => mocks.hydrate(...args),
  startLibrarySync: (...args: unknown[]) => mocks.startSync(...args),
}));

const ok: LibrarySyncResult = { status: "success" };
const failed: LibrarySyncResult = { status: "error" };

beforeEach(() => {
  vi.useFakeTimers();
  mocks.userId = "user-1";
  mocks.hydrate.mockReset();
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

    act(() => reportResult?.({ status: "conflict", conflictingKeys: ["key"] }));

    expect(stop).not.toHaveBeenCalled();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("not overwritten");
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
});
