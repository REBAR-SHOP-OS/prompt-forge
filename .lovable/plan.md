# Repair three Prompt Forge monitoring findings

## Verification and decision

The cited paths still exist. All 45 targeted tests passed, including tests that explicitly reproduce the oversized-library rejection, empty legacy snapshots, and fail-closed quality evaluation.

The library size rejection is a confirmed defect. The other two findings expose recovery gaps around deliberate safeguards: project images must not leak across projects, and an unavailable quality check must never count as a passing verdict. These require a coordinated recovery design rather than simply restoring workspace fallback or bypassing quality checks. No application code or live data has changed.

## 1. Large libraries load and sync

- Remove the 450 KiB hard rejection from ordinary hydration, push, reconciliation, and conflict resolution. Preserve complete durable records, ordering, and project snapshots; do not solve this by raising the ceiling or truncating history.
- Keep the separate 60 KiB complete-request limit for page-unload keepalive. Larger libraries use ordinary sync, never partial replacement uploads.
- Preserve version-checked writes, conflict handling, verified cache installation, and existing media compaction behavior. Report actual browser quota or network failures truthfully.
- Remove obsolete rejection branches and imports from the ordinary sync path.

## 2. Recover legacy source images safely

- Stop writing synthetic empty image snapshots merely because provenance is unknown. Handle image recovery independently from the legacy job-backfill condition.
- Keep selected-project isolation and cover/reframe exclusions. Do not use creation-time proximity or workspace-wide fallback to assign historical images.
- Recover exact image IDs automatically only when an existing original snapshot or explicit finalization linkage proves membership in that exact project and is visible to the caller.
- For missing or previously synthetic-empty snapshots without trustworthy provenance, offer an owner-only source-image selection and confirmation action. Save the selected sources through the existing project persistence/sync path; shared viewers remain read-only.
- Preserve nonempty snapshots and legitimate image-free projects. User-selected reassociation is not presented as verified historical recovery.

## 3. Recover quality verification without rerendering good clips

- Retain separate passed, failed, and unverified results per rendered job. Actual quality failures require shot correction; evaluator errors require verification retry, not regeneration.
- Add a retry action using already-rendered jobs in original shot order. Refresh signed links, preserve prior passing results, and never queue new generation jobs or spend generation credits for this retry.
- For provider-hosted clips, first inspect the existing authorized provider-video repair/import path. Reuse it only if it matches the exact caller-visible job and storage object; otherwise show an actionable unavailable result instead of weakening the evaluator's URL guard.
- Keep automatic assembly gated on every expected shot completing and passing quality. Never mark an unavailable, oversized, unauthorized, malformed, or failed evaluator response as passed.
- Keep project-storage restrictions and SSRF protections. No arbitrary external URL fetches, permission expansion, or silent quality bypass.

## Technical scope

- Library: `libraryState.ts`, `libraryStateCompaction.ts`, and gate tests; change `LibrarySyncGate.tsx` only if necessary for truthful failure reporting.
- Legacy images: `DashboardPage.tsx`, `projectImageIsolation.ts`, a small source-reassociation control, and behavioral tests.
- Quality: `DashboardPage.tsx`, `shotActionQuality.ts`, a retained recovery state/helper, and behavioral tests. Endpoint source changes are conditional on the authorized storage-ingestion audit and need their own verification.
- Keep the existing WebCodecs merge path; do not introduce another encoder or ffmpeg.wasm.

## Validation before completion

- Add regression tests under `tests/regression/` and run related existing tests.
- Large valid JSON library above 450 KiB: new-device hydration, edit/push/readback on a second simulated device, initial upload, conflict reconciliation, and unchanged full durable values; oversized keepalive remains suppressed.
- Legacy projects: proven linkage recovers exact images; ambiguous/missing and explicit-empty snapshots never inherit unrelated images; owner-confirmed reassociation persists; shared viewers cannot modify; covers/reframes stay excluded.
- Quality: mixed pass/fail/error batches, expired and missing links, provider-hosted video, 413/502 and malformed output; retry preserves passes and job order without rerendering; assembly happens only after all verdicts pass.
- Exercise the affected dashboard recovery actions in an authenticated preview and inspect screenshots. Do not generate media or mutate existing user history merely to test.
- Remove replaced/dead paths, inspect touched files, check available dead-code tooling, inspect preview build diagnostics, and obtain independent review before any draft PR.

## Safety gates and handoff

- Requester: Sattar. Repository: `REBAR-SHOP-OS/prompt-forge`. GitHub identity verified as `rebarshop-24` through the connected GitHub API.
- Current checkout: `main`; no application edits, repair branch, or PR created. Implementation must use a scoped repair lane; branch creation/switching is unavailable in this session under the tool rules. Do not claim a scoped PR exists until that lane is supplied.
- Local verification: 3 test files, 45 tests passed. GitHub checks and authenticated recovery flows have not been verified.
- Risk: medium, primarily historical-image attribution and quality-recovery state. Back up any targeted historical snapshot before a user-confirmed repair.
- Rollback: revert only the eventual repair commit on the repair lane; any user-confirmed snapshot changes need their separate saved originals. No rollback is needed for this investigation.
- Approval of this plan authorizes source repair preparation only. No database, storage, permission, secret, deployment, merge, or publication changes are included.
- Editing source does not deploy live Lovable Cloud functions. Any endpoint deployment is a separate Sattar-controlled gate; preview and published apps currently share that backend.

The monitoring findings remain open until their actual recovery paths are implemented and verified; none is labeled fixed merely from source inspection.
