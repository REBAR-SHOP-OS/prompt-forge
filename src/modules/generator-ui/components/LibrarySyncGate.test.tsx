import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LibrarySyncGate from "./LibrarySyncGate";
import type { LibrarySyncResult } from "@/modules/generator-ui/lib/libraryState";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  hydrate: vi.fn(),
  startSync: vi.fn(),
}));

vi.mock("@/core/auth/AuthProvider", () => ({
  useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }),
}));

vi.mock("@/core/ui/LoadingScreen", () => ({
  default: () => <div>Loading library</div>,
}));

vi.mock("@/modules/generator-ui/lib/libraryState", () => ({
  hydrateLibraryFromServer: (...args: unknown[]) => mocks.hydrate(...args),
  startLibrarySync: (...args: unknown[]) => mocks.startSync(...args),
}));

const ok: LibrarySyncResult = { status: "success" };
const failed: LibrarySyncResult = { status: "error" };

beforeEach(() => {
  vi.useFakeTimers();
  mocks.userId = "user-1";
  mocks.hydrate.mockReset();
  mocks.startSync.mockReset();
  mocks.startSync.mockReturnValue(vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LibrarySyncGate", () => {
  it("retries a transient hydration failure with backoff before mounting once", async () => {
    mocks.hydrate.mockResolvedValueOnce(failed).mockResolvedValueOnce(ok);
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);

    expect(screen.getByText("Loading library")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(mocks.hydrate).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(250); });

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(mocks.hydrate).toHaveBeenCalledTimes(2);
    expect(mocks.startSync).toHaveBeenCalledTimes(1);
  });

  it("shows a final error and allows one manual retry without duplicate work", async () => {
    mocks.hydrate.mockResolvedValue(failed);
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(screen.getByRole("alert")).toHaveTextContent("Library unavailable");
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(mocks.hydrate).toHaveBeenCalledTimes(3);
    expect(mocks.startSync).not.toHaveBeenCalled();

    mocks.hydrate.mockResolvedValue(ok);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
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

  it("makes pending hydration ineffective after unmount", async () => {
    let resolveHydration: (result: LibrarySyncResult) => void = () => {};
    mocks.hydrate.mockReturnValue(new Promise<LibrarySyncResult>((resolve) => {
      resolveHydration = resolve;
    }));
    const view = render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);

    view.unmount();
    await act(async () => { resolveHydration(ok); });

    expect(mocks.startSync).not.toHaveBeenCalled();
  });

  it("stops sync and exposes a retryable conflict without mounting the dashboard", async () => {
    const stop = vi.fn();
    let reportIssue: ((result: LibrarySyncResult) => void) | undefined;
    mocks.hydrate.mockResolvedValue(ok);
    mocks.startSync.mockImplementation((_userId, callback) => {
      reportIssue = callback;
      return stop;
    });
    render(<LibrarySyncGate><div>Dashboard</div></LibrarySyncGate>);
    await act(async () => {});

    act(() => reportIssue?.({ status: "conflict", conflictingKeys: ["key"] }));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Nothing was overwritten");
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });
});
