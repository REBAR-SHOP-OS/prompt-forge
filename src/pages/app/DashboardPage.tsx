import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthProvider";
import { api, ApiError } from "@/lib/api";

export default function DashboardPage() {
  const { profile } = useAuth();
  const [provider, setProvider] = useState<"flow" | "wan">("flow");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<{ resolvedModel: string; estimatedCost: number; requestId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function preview() {
    setError(null);
    setResult(null);
    if (!prompt.trim()) { setError("Prompt required"); return; }
    setLoading(true);
    try {
      const r = await api.routePreview({ providerKey: provider, prompt });
      setResult({ resolvedModel: r.resolvedModel, estimatedCost: r.estimatedCost, requestId: r.requestId });
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome, {profile?.email}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Credit balance</CardTitle>
            <CardDescription>Used by future generation jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{profile?.credits_balance ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generation</CardTitle>
            <CardDescription>Generation modules ship in later phases.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Coming soon: prompt → video pipeline, library, downloads.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Gateway · Route preview</CardTitle>
          <CardDescription>Resolve provider/model and estimate cost without calling external APIs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as "flow" | "wan")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flow">flow</SelectItem>
                  <SelectItem value="wan">wan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Input id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="A cinematic shot of…" />
            </div>
          </div>
          <Button onClick={preview} disabled={loading}>
            {loading ? "Resolving…" : "Preview route"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div><span className="text-muted-foreground">Resolved model:</span> {result.resolvedModel}</div>
              <div><span className="text-muted-foreground">Estimated cost:</span> ${result.estimatedCost}</div>
              <div className="font-mono text-xs text-muted-foreground">request_id: {result.requestId}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
