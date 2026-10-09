// Hydrates the per-user library before the dashboard mounts when possible.
// A valid local cache remains usable during transient backend failures; once the
// dashboard is mounted, background sync issues never unmount it.
import { ReactNode, useEffect, useRef, useState } from "react";
import { useAuth } from "@/core/auth/auth-context";
import LoadingScreen from "@/core/ui/LoadingScreen";
import {
  hasUsableLocalLibraryCache,
  hydrateLibraryFromServer,
  startLibrarySync,
  type LibrarySyncResult,
} from "@/modules/generator-ui/lib/libraryState";

const HYDRATION_BACKOFF_MS = [500, 1_500] as const;
const BACKGROUND_HYDRATION_BACKOFF_MS = [2_000, 5_000, 15_000] as const;

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
  const [retryNonce, setRetryNonce] = useState(0);
  const retryRequestedRef = useRef(false);

  useEffect(() => {
    retryRequestedRef.current = false;
    if (!userId) {
      setStatus("loading");
      setSyncNotice(null);
      return;
    }

    const controller = new AbortController();
    let stopSync: (() => void) | undefined;

    const startBackgroundSync = () => {
      stopSync = startLibrarySync(userId, (result) => {
        if (controller.signal.aborted) return;
        if (result.status === "success") {
          setSyncNotice(null);
          return;
        }
        setFailure(result.status);
        setSyncNotice(result.status === "conflict"
          ? "Library changes need review. Your local work was not overwritten."
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

    setStatus("loading");
    setSyncNotice(null);
    void (async () => {
      const result = await hydrateWithBackoff(HYDRATION_BACKOFF_MS, true);
      if (!result || controller.signal.aborted) return;
      if (result.status === "success") {
        startBackgroundSync();
        setStatus("ready");
        return;
      }

      if (hasUsableLocalLibraryCache(userId)) {
        setFailure(result.status);
        setSyncNotice(result.status === "conflict"
          ? "Library changes need review. Your local work was not overwritten."
          : "Using your saved library. Sync will continue in the background.");
        setStatus("ready");
        if (result.status === "conflict") return;

        const recovered = await hydrateWithBackoff(BACKGROUND_HYDRATION_BACKOFF_MS, false, true);
        if (!recovered || controller.signal.aborted) return;
        if (recovered.status === "success") {
          startBackgroundSync();
          setSyncNotice(null);
        } else if (recovered.status === "conflict") {
          setFailure("conflict");
          setSyncNotice("Library changes need review. Your local work was not overwritten.");
        }
        return;
      }

      setFailure(result.status);
      setStatus("error");
    })();

    return () => {
      controller.abort();
      stopSync?.();
    };
  }, [retryNonce, userId]);

  if (status === "loading") return <LoadingScreen />;
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
        </div>
      ) : null}
      {children}
    </>
  );
}
