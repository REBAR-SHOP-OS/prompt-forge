import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import type { Me } from "@/core/api/types";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./auth-context";

const mocks = vi.hoisted(() => ({
  authCallback: null as null | ((event: string, session: Session | null) => void),
  getSession: vi.fn(),
  request: vi.fn(),
  unsubscribe: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((callback) => {
        mocks.authCallback = callback;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      }),
      getSession: mocks.getSession,
      signOut: mocks.signOut,
    },
  },
}));

vi.mock("@/core/api/client", () => ({ request: mocks.request }));

function sessionFor(id: string): Session {
  return {
    access_token: `token-${id}`,
    refresh_token: `refresh-${id}`,
    token_type: "bearer",
    expires_in: 3600,
    user: { id, email: `${id}@example.com` },
  } as unknown as Session;
}

function profileFor(id: string): Me {
  return {
    id,
    email: `${id}@example.com`,
    role: "user",
    credits_balance: 10,
    created_at: "2026-09-17T00:00:00Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function Consumer() {
  const { user, profile, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.id ?? "none"}</span>
      <span data-testid="profile">{profile?.id ?? "none"}</span>
    </div>
  );
}

describe("AuthProvider profile lifecycle", () => {
  beforeEach(() => {
    mocks.authCallback = null;
    mocks.getSession.mockReset().mockResolvedValue({ data: { session: null } });
    mocks.request.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the old /me request and ignores its stale response after the user changes", async () => {
    const first = deferred<Me>();
    const second = deferred<Me>();
    mocks.request.mockImplementationOnce((_path, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return first.promise;
    }).mockImplementationOnce(() => second.promise);

    render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    act(() => mocks.authCallback?.("SIGNED_IN", sessionFor("user-a")));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    const firstSignal = mocks.request.mock.calls[0]?.[1]?.signal as AbortSignal;

    act(() => mocks.authCallback?.("SIGNED_IN", sessionFor("user-b")));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
    expect(screen.getByTestId("user")).toHaveTextContent("user-b");

    await act(async () => { first.resolve(profileFor("user-a")); });
    expect(screen.getByTestId("profile")).toHaveTextContent("none");

    await act(async () => { second.resolve(profileFor("user-b")); });
    expect(screen.getByTestId("profile")).toHaveTextContent("user-b");
  });

  it("releases the loading gate after the bounded timeout when session lookup hangs", async () => {
    vi.useFakeTimers();
    mocks.getSession.mockReturnValue(new Promise(() => {}));

    render(<AuthProvider><Consumer /></AuthProvider>);
    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    await act(async () => { vi.advanceTimersByTime(8_000); });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });
});
