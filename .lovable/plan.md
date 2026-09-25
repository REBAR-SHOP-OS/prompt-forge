# CPU-safe image preview repair

## Outcome
Prevent the third-attempt CPU termination by resolving each reference once and returning an identity-safe, action-only candidate immediately for outer quality correction.

## Changes
- Add a request-scoped reference resolver cache and verified chunked base64 conversion.
- Stop inner retries on identity-safe/action-only review and return HTTP 200 with existing nonfatal review metadata.
- Preserve bounded retries and HTTP 422 for identity mismatch, HTTP 502 for evaluator failures, and normal success for full passes.
- Add focused deterministic tests for caching, early return, identity fail-closed behavior, and full pass.

## Validation and release
- Run focused tests, full tests, app typecheck, Deno check, and production build.
- Inspect the final diff and confirm unrelated generated/backend files remain untouched.
- Deploy only `ai-image-generate`; do not publish the app.
- Run one authenticated 5-second, one-shot Rebar Stirrup preview and stop before Approve/render.
- Inspect fresh function logs and report revision, files, checks, deployment, UI outcome, limitations, and rollback.

## Technical scope
Only `supabase/functions/ai-image-generate/` and the corresponding focused test file may change. No database, migration, app publish, or unrelated file changes.
