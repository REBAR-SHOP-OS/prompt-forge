# Prompt Forge — CLAUDE.md
# Agent: forge-agent | Branch: agent/forge-agent

## Purpose
AI video generation platform -- prompt building, job orchestration, credit management.
Integrates Wan/Flow providers for video generation and local LLM planning.

## Repo
Path: C:\Users\SattarEsmaeili\Documents\Codex\prompt-forge
GitHub: github.com/REBAR-SHOP-OS/prompt-forge
Live: prompt-forge.lovable.app
Stack: React + Vite + TypeScript + Supabase

## Modules
- admin-monitor -- system monitoring
- credit-management -- credit tracking and allocation
- external-api-adapter -- Wan/Flow provider integration
- generator-ui -- prompt builder, scenario writer UI
- job-orchestrator -- job lifecycle management and progress tracking
- video-library -- generated video storage and retrieval

## Agent responsibilities (forge-agent)
1. Monitor job queue -- pick up pending jobs and trigger generation
2. Credit validation -- check balance before job creation
3. Provider routing -- select Wan vs Flow based on job type
4. Error recovery -- retry failed jobs, surface errors to admin
5. Metadata indexing -- update video-library after successful generation

## Critical rules
- TSC must be clean before pushing
- Work on a scoped branch, run the repo checks, and open/update a DRAFT PR. Only
  Sattar may mark ready, approve, merge, or publish through Lovable Cloud.
- Do not touch credit ledger directly -- use credit-management module API
- Provider API keys are in Supabase secrets -- never hardcode

## Build commands
bun install && bun run dev
bun run tsc --noEmit
bun run build

---

## RECURRING-DEFECT GUARDRAILS (from 2-year PR-history audit)

These rules exist because the patterns below actually shipped and had to be
reverted or re-fixed across the REBAR repos (prompt-forge itself hit a TDZ
production crash, #50/#51). They apply to every change here. The **Coder**
subsection is how you avoid producing them; the **Reviewer** subsection is the
hard checklist a review must clear before a PR is handed to Sattar.

### Coder — prevent (mandatory)

1. **Domain values are load-bearing.** Never emit, convert, or store a quantity
   without an explicit unit/type, and never convert without a written check —
   here that means credits, job counts, durations, and provider IDs. State the
   unit/type at the call site.
2. **Root-cause, not band-aid.** Before touching a subsystem, check whether it
   already has prior fixes (`git log --oneline -- <path>`, recent PRs). If this
   is the Nth patch to the same area (job orchestration and provider routing
   have churned), fix the underlying cause and say so in the PR body.
3. **Green-before-PR is absolute.** `bun run tsc --noEmit` and `bun run build`
   must be clean before pushing. Never open or update a red PR; never mark a
   `[WIP]` change as done.
4. **No silent failures; status must be truthful.** Surface errors to logs and
   admin UI (this is already a stated forge-agent responsibility). Never show
   success on a failed job, never swallow an exception, never leave a job
   silently stuck.
5. **Security self-check before every PR.** Provider API keys live in Supabase
   secrets — never hardcode. No hardcoded secrets/keys/IVs; random IV/nonce per
   use; minimum scopes; sanitize untrusted strings; least-privilege workflow
   perms; clear CodeQL-class issues yourself.
6. **Scope and idempotency.** Scope every query by user/tenant. Make job
   creation and credit writes idempotent and dedupe retries so a retry cannot
   double-charge credits or double-queue a job. Do not touch the credit ledger
   directly — use the credit-management module API.
7. **Runtime-order safety.** Declare before use (no TDZ), keep hook order
   unconditional, and defensively parse provider responses so a bad response
   degrades instead of crashing.

### Reviewer — catch (block the PR if any fails)

- **Domain values:** units/types labelled; credit/job math checked.
- **WIP/red:** reject any `[WIP]` marker or failing tsc/build.
- **Repeat offender:** another fix to a frequently-patched area → require a
  root-cause statement, not a surface patch.
- **Regression risk:** touches module init order, hooks, or provider routing →
  require evidence it does not reintroduce a past crash.
- **Security:** no hardcoded provider keys/secrets/IVs, no over-broad scopes,
  no new CodeQL alerts.
- **Observability:** job failures surfaced to admin; status truthful; no
  swallowed errors; no silently-stuck jobs.
- **Data integrity:** user scoping present; credit/job writes idempotent; ledger
  touched only via credit-management API.
- The Reviewer inspects, runs checks, and reports. It does **not** author code,
  approve, or merge — those remain Sattar-only.
