## Goal

The narration written in the scenario/prompt must ALWAYS be the single source of truth ("ملاک"): it must always appear in the Narration dialog's "From prompt" section, and the on-film transcript must always be compared against it. Today the dialog re-derives narration with a regex from each card's `input_prompt`, which silently fails for valid narration phrased outside the two patterns it recognizes — producing "No narration detected" even when the scenario clearly wrote narration (see screenshots).

## Root cause

- `extractNarration` (`src/modules/generator-ui/lib/narration.ts`) only matches (1) a `Narration:` labeled line and (2) text inside quotes. Scenario/ad scenes also express spoken lines as `Character says: "…"`, `<speaker> says: …`, or short labeled lines without quotes. Anything outside the two patterns → empty → "No narration detected".
- There is no persisted narration. Each open of the dialog re-runs the regex, so detection depends entirely on the exact wording stored in `input_prompt`. If the prompt is later edited or rephrased, the narration "reference" changes or disappears.

## Plan

### 1. Broaden and harden narration extraction (authoritative parser)
In `src/modules/generator-ui/lib/narration.ts`, extend `extractNarration` to recognize every spoken-line shape the scenario writer emits, in priority order:
- Localized `Narration:` label lines (existing).
- Speaker lines: `<Name> says:`, `Character says:`, `Narrator:`, `Voiceover:` / `VO:` and their localized equivalents — capture the remainder of the line, stripping surrounding quotes.
- Inline quoted dialogue (existing), straight/smart/guillemet quotes.
- De-duplicate (existing).
Keep it deterministic (no AI). This guarantees narration that exists in the prompt is detected regardless of phrasing.

### 2. Make the scenario narration the persisted reference
So the reference can never drift from what the scenario produced:
- Capture the canonical narration at the moment cards are created from a scenario (the multi-scene/"Send to Pending" + split-generation paths in `DashboardPage.tsx`), using the broadened parser on each scene block, and store it alongside the card.
- Persist it via a new nullable `narration_text` column on `generator_generation_jobs` (additive migration; nullable; existing rows unaffected; GRANTs already present on the table — re-affirm SELECT/INSERT/UPDATE for `authenticated` and `service_role`). Plumb it through `createJob` (job-orchestrator contract/gateway/service + `jobs-create` / `jobs-create-from-upload`) and surface it in `jobs-get` / `jobs-list`.
- The Narration dialog and the card's narration badge use `narration_text` first (the authoritative scenario narration) and fall back to `extractNarration(input_prompt)` for older cards or manual prompts.

### 3. Always compare the film against this reference
`NarrationDialog` already transcribes the rendered video and runs `compareNarration`. Point its "From prompt" section and the comparison baseline at the authoritative narration from step 2, so the on-film check is always measured against the scenario narration and flags missing / mismatched / mispronounced lines.

## Technical notes

- Migration: `ALTER TABLE public.generator_generation_jobs ADD COLUMN narration_text text;` followed by the standard GRANT block; no backfill required (NULL → fall back to extraction).
- No change to the video-generation provider payload — narration stays inside `input_prompt` for generation; `narration_text` is metadata used only for the reference/check UI, so the working generation pipeline is untouched.
- Pure-frontend fallback (step 1 + dialog wiring) already fixes the visible "No narration detected" bug on its own; the persistence in step 2 makes it durable against prompt edits.

## Files
- `src/modules/generator-ui/lib/narration.ts` — broaden parser.
- `src/modules/generator-ui/components/NarrationDialog.tsx` — prefer `narration_text`, fall back to extraction.
- `src/modules/generator-ui/pages/DashboardPage.tsx` — capture narration on card creation; pass to `createJob`; badge + dialog use authoritative value.
- `src/modules/job-orchestrator/*` and `supabase/functions/_shared/modules/job-orchestrator/*`, `jobs-create`, `jobs-create-from-upload`, `jobs-get`, `jobs-list` — carry `narration_text`.
- One new migration for the `narration_text` column + GRANTs.

## Scope check
If you prefer the smallest safe change first, I can ship steps 1 + 3 only (frontend) — that resolves the "No narration detected" screenshots immediately — and add the persistence (step 2) afterward. Tell me which scope you want.