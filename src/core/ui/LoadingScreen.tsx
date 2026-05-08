import { useEffect, useState } from "react";

export default function LoadingScreen() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm">Loading…</span>
      </div>
      {slow && (
        <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
          <span>Still connecting…</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-border px-3 py-1 text-xs transition hover:bg-muted"
          >
            Reload
          </button>
        </div>
      )}
    </div>
  );
}
