import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function AdminPage() {
  const [health, setHealth] = useState<{ status: string; version: string; timestamp: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">Foundation observability summary</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Service health</CardTitle>
          <CardDescription>Live response from /health endpoint.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {health ? (
            <div className="space-y-1 text-sm">
              <div><span className="text-muted-foreground">Status:</span> {health.status}</div>
              <div><span className="text-muted-foreground">Version:</span> {health.version}</div>
              <div><span className="text-muted-foreground">Timestamp:</span> {health.timestamp}</div>
            </div>
          ) : !error ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Stats</CardTitle>
          <CardDescription>Full admin analytics ship in a later phase.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Audit logs and request logs are being captured server-side.</p>
        </CardContent>
      </Card>
    </div>
  );
}
