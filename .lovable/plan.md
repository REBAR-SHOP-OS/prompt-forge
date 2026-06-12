## Problem

Two clips that were generated in **one** workspace session correctly show as a single draft project — until the page is refreshed. After a refresh they split into **two separate single-clip draft projects**.

Per the user's rule:
- While generating, the workspace is **one draft project** that holds all the cards made in it.
- After a refresh, that draft project must still appear as **one** project in the Drafts list, containing its cards.
- When the project is finalized, the draft is removed and it moves to **Final videos**.
- Draft projects must never merge their cards with other projects, and a single card must never be shown as its own project.
- Legacy drafts that are already fragmented should **auto-regroup**.

## Root cause

Draft grouping today lives **only in the browser (localStorage)**: `jobDraftMap` (clip id → draft id), `draftSourceJobs`, `draftEntries`. The Library builds one card per draft id by grouping clips via `jobDraftMap`.

On refresh, jobs are reloaded fresh from the server (`listMyJobs`), but the server jobs carry **no grouping field**. If the local `jobDraftMap` is missing/incomplete for any clip (lost write, mount-time race, cross-device, cleared storage), the "orphan backfill" effect assigns **each unmapped clip its own isolated draft** (`draft-orphan-<jobId>`). That is exactly the split the user sees.

Because the grouping has no durable, authoritative home, the rule cannot be guaranteed across refresh. The fix is to persist the group id **on the job/image rows themselves** and group by that.

## Fix

### 1. Database — add a durable group id (migration)
- `ALTER TABLE public.generator_generation_jobs ADD COLUMN draft_group_id uuid;`
- `ALTER TABLE public.generator_user_images ADD COLUMN draft_group_id uuid;`
- Add helpful indexes: `(user_id, draft_group_id)` on both.
- Allow the owner to set/update `draft_group_id` (needed for the one-time legacy migration): confirm the existing UPDATE RLS policy covers own rows, and (for jobs) ensure the `guard_generation_job_updates` trigger does **not** block changing only `draft_group_id` (it currently lists other columns; add an explicit allowance so a user updating just `draft_group_id` passes). `parent_final_job_id` already exists for the finalize step and is untouched.

### 2. Backend — thread the group id through create + reads
- `CreateJobInput` (contract + Zod schema in `job-orchestrator/gateway.ts`): add optional `draftGroupId: string (uuid)`.
- `jobService.createJob` (`service.ts`): include `draft_group_id` in the post-insert `update` block (service role, same place `requested_aspect_ratio`/`first_frame_url` are written).
- `JOB_COLUMNS` select list: add `draft_group_id` so `listMyJobs`/`getMyJob` return it.
- `JobSummary`/`JobDetail` types (frontend + backend contract): add `draft_group_id?: string | null`.

### 3. Frontend — generate one group id per session and send it
- Reuse the existing per-session draft id. `ensureActiveDraftId()` returns `draft-<uuid>`; derive a real uuid group id from it (or store a parallel uuid). Pass it as `draftGroupId` on **every** `createJob` call (text-to-video, image-to-video, scenes loop, regenerate/derived, product ad) and persist it on uploaded-image inserts (`generator_user_images.draft_group_id`).
- Derived clips (regenerate / video-to-video) inherit the **source clip's** group id, so they stay in the same project.

### 4. Frontend — group drafts by the server group id (authoritative)
- In the draft-grouping effect, group clips/images by **`draft_group_id` from the job/image row** first. Fall back to the local `jobDraftMap`/`imageDraftMap` only when the server value is absent (legacy rows). Only when neither exists does a clip become its own orphan draft.
- This makes refresh deterministic: same server group id ⇒ same single draft card, every time, on any device.

### 5. Legacy auto-regroup (one-time, on load)
- On load, for every clip/image that already has a **local** group mapping but **no** server `draft_group_id`, write the local group id (as a uuid) to the server row. This permanently stamps the grouping that currently exists in the browser, so after this runs once the project stays merged across all future refreshes.
- For drafts that were already fragmented into orphan singletons but still share a creation chain (clips linked via `first_frame_url`/`last_frame_url`), merge them under one group id during the same migration.
- Keep the existing `deletedDraftIds` tombstones so user-deleted drafts never resurrect.

### 6. Finalize behavior (unchanged, verified)
- When Final Film succeeds, the draft is removed and the project moves to Final videos (existing `parent_final_job_id` flow). No change needed beyond making sure finalized clips are excluded from draft grouping (already handled via `projectSourceJobs`/`finalClaimedJobs`).

## Outcome

- All clips made in one workspace session share a durable `draft_group_id` and always appear as **one** draft project — before and after refresh, and across devices.
- A single card is never shown as its own project (unless it genuinely is a one-clip draft).
- Existing fragmented drafts auto-regroup on next load via the one-time server stamping/chain-merge.
- Finalizing still moves the project from Drafts to Final videos.

## Technical notes

Files/areas touched:
- **Migration**: add `draft_group_id` to `generator_generation_jobs` and `generator_user_images` (+ indexes, RLS/trigger allowance).
- `supabase/functions/_shared/modules/job-orchestrator/gateway.ts` — Zod `CreateJobSchema` + pass-through.
- `supabase/functions/_shared/modules/job-orchestrator/service.ts` — `JOB_COLUMNS` + `createJob` update block.
- `supabase/functions/_shared/modules/job-orchestrator/contract.ts` and `src/modules/job-orchestrator/contract.ts` — `draftGroupId` input + `draft_group_id` on summary/detail.
- `src/modules/generator-ui/pages/DashboardPage.tsx` — send group id on create; group drafts by server `draft_group_id` with local fallback; one-time legacy migration; keep orphan path only as last resort.

No change to credit logic, finalize RPC, or unrelated flows.