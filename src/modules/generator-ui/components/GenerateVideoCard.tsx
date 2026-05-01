import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/core/api/client";
import { useAuth } from "@/core/auth/AuthProvider";
import { jobOrchestratorGateway } from "@/modules/job-orchestrator/gateway";
import type { JobDetail } from "@/modules/job-orchestrator/contract";
import type { ProviderKey } from "@/modules/external-api-adapter/contract";

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_MS = 60_000;

export default function GenerateVideoCard() {
  const { refreshProfile } = useAuth();
  const [provider, setProvider] = useState<ProviderKey>("flow");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const pollStartRef = useRef<number>(0);

  useEffect(() => () => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }

  async function pollJob(jobId: string) {
    try {
      const detail = await jobOrchestratorGateway.getJob(jobId);
      setJob(detail);
      const isTerminal = detail.status === "completed" || detail.status === "failed" || detail.status === "cancelled";
      const elapsed = Date.now() - pollStartRef.current;
      if (!isTerminal && elapsed < POLL_MAX_MS) {
        pollRef.current = window.setTimeout(() => pollJob(jobId), POLL_INTERVAL_MS);
      } else {
        stopPolling();
        if (detail.status === "completed") {
          refreshProfile();
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message);
      stopPolling();
    }
  }

  async function submit() {
    setError(null);
    if (!prompt.trim()) { setError("Prompt required"); return; }
    setSubmitting(true);
    setJob(null);
    stopPolling();
    try {
      const r = await jobOrchestratorGateway.createJob({ providerKey: provider, prompt });
      // Seed job state, then start polling for status updates.
      setJob({
        id: r.jobId,
        status: r.status,
        input_prompt: prompt,
        provider_key: r.providerKey,
        model_key: r.resolvedModel,
        created_at: new Date().toISOString(),
        video: null,
      });
      // Refresh credit balance immediately (debit happened on the server).
      refreshProfile();
      pollStartRef.current = Date.now();
      pollJob(r.jobId);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate video</CardTitle>
        <CardDescription>Submit a prompt — credits are deducted once the job is accepted.</CardDescription>
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
            <Label htmlFor="gen-prompt">Prompt</Label>
            <Input
              id="gen-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A cinematic shot of…"
            />
          </div>
        </div>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Submitting…" : "Generate"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {job && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2">
            <div><span className="text-muted-foreground">Job:</span> <span className="font-mono text-xs">{job.id}</span></div>
            <div><span className="text-muted-foreground">Status:</span> {job.status}</div>
            <div><span className="text-muted-foreground">Model:</span> {job.model_key}</div>
            {job.status === "processing" && (
              <p className="text-xs text-muted-foreground">Polling for completion…</p>
            )}
            {job.video && (
              <div className="space-y-1">
                <div className="text-muted-foreground">Video:</div>
                <a
                  href={job.video.storage_path}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline break-all"
                >
                  {job.video.storage_path}
                </a>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
