// Hydrates the per-user library before the dashboard mounts when possible.
// A valid local cache remains usable during transient backend failures; once the
// dashboard is mounted, background sync issues never unmount it.
import { ReactNode, useEffect, useRef, useState } from "react";
import { useAuth } from "@/core/auth/auth-context";
import LoadingScreen from "@/core/ui/LoadingScreen";
import {
  hasUsableLocalLibraryCache,
  hydrateLibraryFromServer,
  pushLibraryToServer,
  startLibrarySync,
  type LibrarySyncResult,
} from "@/modules/generator-ui/lib/libraryState";

const HYDRATION_BACKOFF_MS = [500, 1_500] as const;
const BACKGROUND_HYDRATION_BACKOFF_MS = [2_000, 5_000, 15_000] as const;

const CONFLICT_NOTICE = "Library changes need review. Your local work was not overwritten.";
const SAVED_LIBRARY_NOTICE = "Using your saved library. Sync will continue in the background.";
const OFFLINE_NOTICE = "Using your saved library. Sync will retry when your connection returns.";

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = window.setTimeout(() => resolve(true), delayMs);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      resolve(false);
    }, { once: true });
  });
}

type GateStatus = "loading" | "ready" | "error";

export default function LibrarySyncGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<GateStatus>("loading");
  const [failure, setFailure] = useState<Exclude<LibrarySyncResult["status"], "success">>("error");
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [noticeActionAvailable, setNoticeActionAvailable] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryRequestedRef = useRef(false);
  const resolveRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    retryRequestedRef.current = false;
    resolveRef.current = null;
    setNoticeActionAvailable(false);
    if (!userId) {
      setStatus("loading");
      setSyncNotice(null);
      return;
    }

    const controller = new AbortController();
    let stopSync: (() => void) | undefined;
    let removeOnlineRetry: (() => void) | undefined;

    const startBackgroundSync = () => {
      if (stopSync) return;
      stopSync = startLibrarySync(userId, (result) => {
        if (controller.signal.aborted) return;
        if (result.status === "success") {
          setSyncNotice(null);
          return;
        }
        setFailure(result.status);
        setSyncNotice(result.status === "conflict"
          ? CONFLICT_NOTICE
          : "Working from this device. Library sync will retry in the background.");
      });
    };

    const hydrateWithBackoff = async (
      delays: readonly number[],
      initialAttempt: boolean,
      preserveLocal = false,
    ): Promise<LibrarySyncResult | null> => {
      let result: LibrarySyncResult = { status: "error" };
      for (let attempt = 0; attempt <= delays.length; attempt += 1) {
        if (!initialAttempt || attempt > 0) {
          const delay = initialAttempt ? delays[attempt - 1] : delays[attempt];
          if (delay == null || !(await waitForRetry(delay, controller.signal))) return null;
        }
        result = await hydrateLibraryFromServer(userId, controller.signal, preserveLocal);
        if (controller.signal.aborted) return null;
        if (result.status === "success" || result.status === "conflict") return result;
      }
      return result;
    };

    // A recovery conflict leaves local work preserved locally with a server
    // baseline recorded by the hydration. Reconcile it with an explicit push
    // (which three-way merges against the latest server state) instead of
    // stranding it behind a notice with no way forward.
    const attemptResolution = async (): Promise<void> => {
      const settled = await hydrateLibraryFromServer(userId, controller.signal, true);
      if (controller.signal.aborted) return;
      if (settled.status === "success") {
        removeOnlineRetry?.();
        setSyncNotice(null);
        setNoticeActionAvailable(false);
        startBackgroundSync();
        return;
      }
      if (settled.status === "conflict") {
        const pushed = await pushLibraryToServer(userId);
        if (controller.signal.aborted) return;
        if (pushed.status === "success") {
          removeOnlineRetry?.();
          setSyncNotice(null);
          setNoticeActionAvailable(false);
          startBackgroundSync();
          return;
        }
        setFailure("conflict");
        setSyncNotice(CONFLICT_NOTICE);
        setNoticeActionAvailable(true);
        return;
      }
      setSyncNotice(OFFLINE_NOTICE);
      setNoticeActionAvailable(true);
    };
    resolveRef.current = attemptResolution;

    setStatus("loading");
    setSyncNotice(null);
    void (async () => {
      // When a saved library exists on this device, hydrate in recovery mode:
      // a diverged server state must surface as a conflict to resolve, never
      // as a silent replacement of work a previous session preserved.
      const hasCache = hasUsableLocalLibraryCache(userId);
      const result = await hydrateWithBackoff(HYDRATION_BACKOFF_MS, true, hasCache);
      if (!result || controller.signal.aborted) return;
      if (result.status === "success") {
        startBackgroundSync();
        setStatus("ready");
        return;
      }

      if (hasCache) {
        setFailure(result.status);
        setSyncNotice(result.status === "conflict" ? CONFLICT_NOTICE : SAVED_LIBRARY_NOTICE);
        setStatus("ready");
        if (result.status === "conflict") {
          await attemptResolution();
          return;
        }

        const recovered = await hydrateWithBackoff(BACKGROUND_HYDRATION_BACKOFF_MS, false, true);
        if (controller.signal.aborted) return;
        if (recovered?.status === "success") {
          startBackgroundSync();
          setSyncNotice(null);
          return;
        }
        if (recovered?.status === "conflict") {
          setFailure("conflict");
          setSyncNotice(CONFLICT_NOTICE);
          await attemptResolution();
          return;
        }
        // Background retries are exhausted and background sync has not
        // started, so promising that sync "will continue in the background"
        // would be false. Keep the saved library usable, retry when
        // connectivity returns, and offer a manual retry in the notice.
        setSyncNotice(OFFLINE_NOTICE);
        setNoticeActionAvailable(true);
        const onOnline = () => { void attemptResolution(); };
        window.addEventListener("online", onOnline);
        removeOnlineRetry = () => window.removeEventListener("online", onOnline);
        return;
      }

      setFailure(result.status);
      setStatus("error");
    })();

    return () => {
      controller.abort();
      stopSync?.();
      removeOnlineRetry?.();
    };
  }, [retryNonce, userId]);

  if (status === "loading") {
    return (
      <LoadingScreen slowMessage="Still connecting… If this device has a saved library, it will open from that copy." />
    );
  }
  if (status === "error") {
    const message = failure === "conflict"
      ? "Library changes conflict with a newer version. Nothing was overwritten."
      : "We couldn't load your library and no saved device cache was available. Check your connection and try again.";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-4 text-center" role="alert">
          <h1 className="text-xl font-semibold text-foreground">Library unavailable</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => {
              if (retryRequestedRef.current) return;
              retryRequestedRef.current = true;
              setStatus("loading");
              setRetryNonce((value) => value + 1);
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {syncNotice ? (
        <div
          className="fixed bottom-3 right-3 z-50 max-w-sm rounded-md border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm"
          role="status"
        >
          {syncNotice}
          {noticeActionAvailable ? (
            <button
              type="button"
              className="ml-2 font-medium text-foreground underline"
              onClick={() => { void resolveRef.current?.(); }}
            >
              Retry sync
            </button>
          ) : null}
        </div>
      ) : null}
      {children}
    </>
  );
}
