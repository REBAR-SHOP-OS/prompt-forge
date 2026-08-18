// Ensures the per-user library layout is hydrated from the backend BEFORE the
// dashboard mounts, so its localStorage-reading effects see synced data. While
// hydrating it shows the loading screen; afterwards it keeps pushing changes up.
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/core/auth/AuthProvider";
import LoadingScreen from "@/core/ui/LoadingScreen";
import {
  hydrateLibraryFromServer,
  startLibrarySync,
  type LibrarySyncResult,
} from "@/modules/generator-ui/lib/libraryState";

const HYDRATION_BACKOFF_MS = [250, 750] as const;

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
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!userId) {
      setStatus("loading");
      return;
    }

    const controller = new AbortController();
    let stopSync: (() => void) | undefined;

    setStatus("loading");
    (async () => {
      let result: LibrarySyncResult = { status: "error" };
      for (let attempt = 0; attempt <= HYDRATION_BACKOFF_MS.length; attempt += 1) {
        if (attempt > 0) {
          const shouldContinue = await waitForRetry(
            HYDRATION_BACKOFF_MS[attempt - 1],
            controller.signal,
          );
          if (!shouldContinue) return;
        }

        result = await hydrateLibraryFromServer(userId, controller.signal);
        if (controller.signal.aborted) return;
        if (result.status === "success") break;
        // Conflicts need an explicit user retry; automatic retries are only
        // for transient hydration errors.
        if (result.status === "conflict") break;
      }

      if (result.status !== "success") {
        setFailure(result.status);
        setStatus("error");
        return;
      }

      stopSync = startLibrarySync(userId, (issue) => {
        if (controller.signal.aborted) return;
        stopSync?.();
        stopSync = undefined;
        setFailure(issue.status);
        setStatus("error");
      });
      setStatus("ready");
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
      : "We couldn't load your library. Check your connection and try again.";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-4 text-center" role="alert">
          <h1 className="text-xl font-semibold text-foreground">Library unavailable</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => {
              // Remove the actionable error state immediately so repeated
              // clicks cannot start parallel retry effects.
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
  return <>{children}</>;
}
