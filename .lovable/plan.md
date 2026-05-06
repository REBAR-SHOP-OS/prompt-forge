# Aspect ratio selector (9:16 / 1:1 / 16:9) for video generation

Add a ratio picker to the bottom prompt bar so the user can choose the output aspect ratio for each generated clip:

- **9:16** — Reels / Shorts (vertical)
- **1:1** — Post (square)
- **16:9** — YouTube (landscape, default)

The chosen ratio is sent end-to-end into the WAN provider call and stored on the job.

## UI — `src/modules/generator-ui/pages/DashboardPage.tsx`

In the bottom prompt form (around lines 2047–2091, where Text/Image-to-Video and 5s/10s pills live), add a third pill group right after the duration group:

- New state: `const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('16:9')`.
- Render a `radiogroup` with three small pills, each showing the ratio and a tiny caption:
  - `9:16` (Reels)
  - `1:1` (Post)
  - `16:9` (YouTube) — default
- Same visual style as the existing duration pills (rounded-full bg-zinc-100/text-zinc-950 when active).
- Persist the last choice to `localStorage` key `generator:aspectRatio` so it survives reloads.

In `handleSubmit` (lines 887–946), pass `aspectRatio` into every `jobOrchestratorGateway.createJob({ ... })` call alongside `durationSeconds`.

## Frontend contract — `src/modules/job-orchestrator/contract.ts`

Extend `CreateJobInput`:
```ts
export type AspectRatio = '9:16' | '1:1' | '16:9'
export interface CreateJobInput {
  // ... existing fields
  aspectRatio?: AspectRatio
}
```

## Edge function contract & validation — `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`

- Extend `CreateJobSchema` with `aspectRatio: z.enum(['9:16', '1:1', '16:9']).optional()`.
- Pass `aspectRatio: parsed.data.aspectRatio ?? '16:9'` into `aiGateway.startGeneration(...)` alongside `durationSeconds`.

## Provider input — `supabase/functions/_shared/modules/external-api-adapter/contract.ts`

Add `aspectRatio?: '9:16' | '1:1' | '16:9' | null` to `GenerationStartInput`.

## WAN provider call — `supabase/functions/_shared/modules/external-api-adapter/service.ts`

- **Text-to-video (`startWanT2V`)**: replace the hard-coded `ratio: "16:9"` parameter with the user-supplied `input.aspectRatio ?? "16:9"`. WAN T2V already accepts this `ratio` parameter directly.
- **Image-to-video (`startWanI2V`)**: WAN i2v derives output aspect from the source image, so we don't fight the provider here. We still forward the parameter (when WAN starts honoring it), but we do **not** crop the user's image. The job is recorded with the user-chosen ratio so the UI badge is consistent.
- After scheduling, write the chosen `aspectRatio` onto the `generator_generation_jobs` row so the gateway's `getJob` response can echo it back. Use a tiny update right after `markProcessing`:
  - `await svc.from('generator_generation_jobs').update({ aspect_ratio: chosenRatio, updated_at: new Date().toISOString() }).eq('id', jobId)`
  - This requires a column `aspect_ratio text` on `generator_generation_jobs`. **Add it via a migration**: `alter table generator_generation_jobs add column if not exists aspect_ratio text;` (no default, nullable).

## Where the ratio surfaces in the UI later

`previewVideo.video?.aspect_ratio` (already on the type) keeps showing the provider-reported ratio for completed videos. The user-chosen ratio is what we used at request time and is stored on the job row for traceability. Card thumbnails keep using `aspect-video` for layout — that's a CSS box, not the actual file ratio.

## Files touched
- `src/modules/generator-ui/pages/DashboardPage.tsx` (selector UI + submit wiring + persistence)
- `src/modules/job-orchestrator/contract.ts` (CreateJobInput field)
- `supabase/functions/_shared/modules/job-orchestrator/gateway.ts` (zod schema + pass-through)
- `supabase/functions/_shared/modules/external-api-adapter/contract.ts` (GenerationStartInput field)
- `supabase/functions/_shared/modules/external-api-adapter/service.ts` (use the ratio in T2V body, accept it in I2V signature)
- New migration: add `aspect_ratio` column on `generator_generation_jobs`
