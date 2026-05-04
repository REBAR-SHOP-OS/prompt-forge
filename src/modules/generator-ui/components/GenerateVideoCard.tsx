import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/core/api/client";
import { useAuth } from "@/core/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { jobOrchestratorGateway } from "@/modules/job-orchestrator/gateway";
import type { JobDetail } from "@/modules/job-orchestrator/contract";
import type { ProviderKey } from "@/modules/external-api-adapter/contract";

const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 10 * 60_000; // Wan i2v jobs can take several minutes.
const FRAMES_BUCKET = "wan-frames";

type FrameSlot = "first" | "last";

interface FrameState {
  uploading: boolean;
  url: string | null;
  error: string | null;
  fileName: string | null;
}

const emptyFrame: FrameState = { uploading: false, url: null, error: null, fileName: null };

export default function GenerateVideoCard() {
  const { session, refreshProfile } = useAuth();
  const [provider, setProvider] = useState<ProviderKey>("wan");
  const [prompt, setPrompt] = useState("");
  const [firstFrame, setFirstFrame] = useState<FrameState>(emptyFrame);
  const [lastFrame, setLastFrame] = useState<FrameState>(emptyFrame);
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

  async function uploadFrame(slot: FrameSlot, file: File) {
    const userId = session?.user?.id;
    if (!userId) {
      const setter = slot === "first" ? setFirstFrame : setLastFrame;
      setter((s) => ({ ...s, error: "You must be signed in to upload" }));
      return;
    }
    const setter = slot === "first" ? setFirstFrame : setLastFrame;
    setter({ uploading: true, url: null, error: null, fileName: file.name });

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${userId}/${slot}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(FRAMES_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setter({ uploading: false, url: null, error: upErr.message, fileName: file.name });
      return;
    }
    const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(path);
    setter({ uploading: false, url: data.publicUrl, error: null, fileName: file.name });
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
        if (detail.status === "completed") refreshProfile();
      }
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message);
      stopPolling();
    }
  }

  async function submit() {
    setError(null);
    if (!prompt.trim()) { setError("Prompt required"); return; }
    if (provider === "wan") {
      if (!firstFrame.url) { setError("First frame image required"); return; }
      if (!lastFrame.url) { setError("Last frame image required"); return; }
    }
    setSubmitting(true);
    setJob(null);
    stopPolling();
    try {
      const r = await jobOrchestratorGateway.createJob({
        providerKey: provider,
        prompt,
        firstFrameUrl: firstFrame.url ?? undefined,
        lastFrameUrl: lastFrame.url ?? undefined,
      });
      setJob({
        id: r.jobId,
        status: r.status,
        input_prompt: prompt,
        provider_key: r.providerKey,
        model_key: r.resolvedModel,
        first_frame_url: firstFrame.url,
        last_frame_url: lastFrame.url,
        created_at: new Date().toISOString(),
        video: null,
      });
      refreshProfile();
      pollStartRef.current = Date.now();
      pollJob(r.jobId);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const renderFrameField = (slot: FrameSlot, label: string, state: FrameState) => (
    <div className="space-y-2">
      <Label htmlFor={`frame-${slot}`}>{label}</Label>
      <Input
        id={`frame-${slot}`}
        type="file"
        accept="image/*"
        disabled={state.uploading || submitting}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadFrame(slot, f);
        }}
      />
      {state.uploading && <p className="text-xs text-muted-foreground">Uploading {state.fileName}…</p>}
      {state.url && (
        <div className="flex items-center gap-2">
          <img src={state.url} alt={`${label} preview`} className="h-16 w-16 rounded border border-border object-cover" />
          <span className="text-xs text-muted-foreground truncate">{state.fileName}</span>
        </div>
      )}
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate video</CardTitle>
        <CardDescription>
          Wan image-to-video: upload a first and last frame, describe the motion, and credits are deducted on submit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as ProviderKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="wan">wan (i2v)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gen-prompt">Prompt</Label>
            <Input
              id="gen-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the motion between the two frames…"
            />
          </div>
        </div>

        {provider === "wan" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {renderFrameField("first", "First frame", firstFrame)}
            {renderFrameField("last", "Last frame", lastFrame)}
          </div>
        )}

        <Button
          onClick={submit}
          disabled={submitting || firstFrame.uploading || lastFrame.uploading}
        >
          {submitting ? "Submitting…" : "Generate"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {job && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2">
            <div><span className="text-muted-foreground">Job:</span> <span className="font-mono text-xs">{job.id}</span></div>
            <div><span className="text-muted-foreground">Status:</span> {job.status}</div>
            <div><span className="text-muted-foreground">Model:</span> {job.model_key}</div>
            {job.status === "processing" && (
              <p className="text-xs text-muted-foreground">Polling provider for completion… (this can take a few minutes)</p>
            )}
            {job.video && (
              <div className="space-y-1">
                <div className="text-muted-foreground">Video:</div>
                <video src={job.video.storage_path} controls className="w-full max-w-md rounded border border-border" />
                <a href={job.video.storage_path} target="_blank" rel="noreferrer" className="text-primary underline break-all text-xs">
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
