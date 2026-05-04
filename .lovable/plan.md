## Goal

Let the user choose the generated clip length — **5 / 10 / 15 seconds** — from a small toggle in the composer (next to the existing "Text to Video / Image to Video" tabs). The chosen value is sent end-to-end to the Wan provider, which already accepts a `duration` parameter.

Default: **5 seconds** (current behavior, no change for users who don't touch the toggle).

## UX Behavior

- New segmented control in the composer: `5s · 10s · 15s` (single-select pill group, same style as the existing mode tabs).
- Visible in **both** Text to Video and Image to Video modes.
- Selection persists in component state for the session; not stored across reloads (keeps it lightweight).
- Sent with every render request; cost/credits handling stays as today (no per-second multiplier in this change — that can be a separate follow-up if desired).

## Technical Changes

### 1. `src/modules/job-orchestrator/contract.ts` (frontend contract)
Add `durationSeconds?: 5 | 10 | 15` to `CreateJobInput`.

### 2. `src/modules/generator-ui/pages/DashboardPage.tsx`
- New state: `const [durationSeconds, setDurationSeconds] = useState<5 | 10 | 15>(5)`.
- Add a 3-button segmented control in the composer toolbar row (same row as the mode tabs).
- In `handleSubmit`, include `durationSeconds` in both `createJob` calls (T2V and I2V).

### 3. `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`
- Extend `CreateJobSchema` with `durationSeconds: z.union([z.literal(5), z.literal(10), z.literal(15)]).optional()`.
- Pass `durationSeconds` through to `aiGateway.startGeneration({...})`.

### 4. `supabase/functions/_shared/modules/external-api-adapter/contract.ts`
- Add `durationSeconds?: 5 | 10 | 15 | null` to `GenerationStartInput`.

### 5. `supabase/functions/_shared/modules/external-api-adapter/service.ts`
- In `startWanI2V`: replace hardcoded `duration: 5` with `duration: input.durationSeconds ?? 5`.
- In `startWanT2V`: same swap.
- The mock paths (other `duration: 5` spots used for non-Wan providers) stay as-is — they're stubs that report a fake duration in the response, not a request parameter.

## What stays unchanged
- Credit costs, cost map, polling, progress estimation, edge function deployments wiring.
- DB schema, RLS, storage.
- All other dashboard behavior (continuation `+`, merge, library, delete, etc.).

## Acceptance
- Composer shows a `5s / 10s / 15s` selector.
- Choosing `10s` and rendering produces a ~10s clip from Wan.
- Choosing nothing keeps today's 5s default.
- Switching modes (Text↔Image) preserves the duration choice.
