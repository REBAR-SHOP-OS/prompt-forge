// Ensures the per-user library layout is hydrated from the backend BEFORE the
// dashboard mounts, so its localStorage-reading effects see synced data. While
// hydrating it shows the loading screen; afterwards it keeps pushing changes up.
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/core/auth/AuthProvider";
import LoadingScreen from "@/core/ui/LoadingScreen";
import {
  hydrateLibraryFromServer,
  startLibrarySync,
} from "@/modules/generator-ui/lib/libraryState";

export default function LibrarySyncGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) {
      setReady(false);
      return;
    }
    let cancelled = false;
    let stopSync: (() => void) | undefined;

    setReady(false);
    (async () => {
      await hydrateLibraryFromServer(userId);
      if (cancelled) return;
      stopSync = startLibrarySync(userId);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      stopSync?.();
    };
  }, [userId]);

  if (!ready) return <LoadingScreen />;
  return <>{children}</>;
}
