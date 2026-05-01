import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/core/api/client";
import { generatorUiGateway } from "@/modules/generator-ui/gateway";
import type { ProviderKey, RoutePreviewResult } from "@/modules/external-api-adapter/contract";

export default function RoutePreviewCard() {
  const [provider, setProvider] = useState<ProviderKey>("flow");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<RoutePreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function preview() {
    setError(null);
    setResult(null);
    if (!prompt.trim()) { setError("Prompt required"); return; }
    setLoading(true);
    try {
      const r = await generatorUiGateway.routePreview({ providerKey: provider, prompt });
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Gateway · Route preview</CardTitle>
        <CardDescription>Resolve provider/model and estimate cost without calling external APIs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as ProviderKey)}>
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
  );
}
