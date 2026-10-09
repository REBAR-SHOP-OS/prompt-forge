import { useEffect, useState } from "react";

const SLOW_CONNECTION_DELAY_MS = 10_000;

export default function LoadingScreen() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), SLOW_CONNECTION_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm">Loading…</span>
      </div>
      {slow ? (
        <p className="text-xs text-muted-foreground" role="status">
          Still connecting… Your saved work will be used when available.
        </p>
      ) : null}
    </div>
  );
}
