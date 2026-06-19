## Goal

Make the copyright-check shield icon (next to Download in the Library → Final Videos row) a real, automatic content gate:

- After a Final Film is produced, it is checked **once, automatically**.
- The icon turns **green** when approved, **red** when rejected, **amber** for caution.
- The verdict is **persisted** so it survives reloads (not recomputed every time).
- Clicking the icon still opens the existing details dialog and offers a manual re-run.

## Current behavior

- `copyright-check` edge function already sends video + music + voiceover to Gemini and returns a structured verdict (`approved` / `caution` / `rejected`). This logic is solid and stays.
- In `DashboardPage.tsx`, `runCopyrightCheck(video)` only runs on manual click and opens a dialog; the result lives in transient state and is lost on reload. The shield icon is always neutral grey.
- No automatic run after finalize. No persistence.

## Changes

### 1. Persist verdicts (database)
Add a new table `generator_copyright_reviews`:

```text
id uuid pk
job_id uuid  (the final film job)
user_id uuid
verdict text          -- approved | caution | rejected
video_status text
music_status text
summary text
result jsonb          -- full structured result for the dialog
created_at / updated_at
unique (job_id)
```

- RLS: users `SELECT` own rows; client insert/update denied (writes only via edge function service role).
- GRANTs: `SELECT` to `authenticated`, `ALL` to `service_role`.

### 2. Edge function `copyright-check`
- Accept an optional `jobId` in the body.
- After computing the result, when `jobId` is present, upsert the row into `generator_copyright_reviews` (service-role client) with verdict/statuses/summary/full result.
- Response shape unchanged (still returns `{ result }`), so the existing dialog keeps working.

### 3. Frontend (`DashboardPage.tsx`)
- **State:** add `copyrightReviews: Record<jobId, CopyrightResult>`.
- **Load on open:** in `loadArchive`, fetch all `generator_copyright_reviews` for the user and populate the map so colors render immediately on reload.
- **Pass `jobId`** in the `runCopyrightCheck` invoke body; on success also store the result into `copyrightReviews[video.id]`.
- **Auto-run once after finalize:** when a Final Film finishes saving, trigger a silent `runCopyrightCheck` for that job (no dialog popup) only if no review exists yet. Guard with an in-flight set so it runs exactly once.
- **Icon coloring:** replace the always-grey `Shield` button with verdict-driven rendering:
  - loading/in-flight → spinner
  - `approved` → `ShieldCheck`, emerald/green
  - `rejected` → `ShieldX`, rose/red
  - `caution` → `ShieldAlert`, amber
  - no review yet → neutral `Shield` (click to check)
- Click behavior unchanged: opens the dialog (now pre-filled from the stored result when available) with a re-run button.

## Out of scope
- No change to the Gemini prompt or verdict thresholds.
- No change to merge/finalize logic beyond firing the one-time check.

## Technical notes
- Auto-run reuses the existing signed-URL preparation in `runCopyrightCheck`; a small variant flag suppresses opening the dialog during the automatic pass.
- Videos over the 25MB inline cap will surface as an error/caution state on the icon, same as the current dialog behavior.