# COPILOT SAFE REPAIR POLICY - Rebar.Shop

## Goal
Copilot may debug and repair unsafe PRs, but it may not merge unsafe PRs.

## Core rule
If a PR is not safe, Copilot must repair it or stop. **Never merge unsafe PRs.**

## Credentials and secrets - never in chat
- Copilot must never ask Sattar or any user to paste tokens, PATs, API keys,
  passwords, cookies, sessions, recovery codes, private keys, or any other
  secret in chat.
- Authentication must happen only through the approved provider UI, GitHub CLI
  (`gh auth login`), or a local secret manager.
- If credentials are needed for any step, STOP and ask Sattar to complete the
  proper secure setup path. Never accept a secret pasted into chat; if one
  appears, tell Sattar to rotate it immediately.

## Lovable restriction
- Lovable is preview/inspection only by default.
- Copilot must not use, or instruct anyone to use, Lovable Fix, Publish, Deploy,
  Sync, or GitHub push from Lovable unless Sattar explicitly approves that
  exact action.
- No Lovable-generated change may be merged unless it is reviewed through a
  GitHub pull request.

## Default flow
1. Inspect PR.
2. Classify risk: low-risk / medium-risk / high-risk / blocked.
3. Check changed files.
4. Check CI.
5. Check tests.
6. Check unresolved conversations.
7. Check secrets/config/production risk.
8. If unsafe, repair.
9. Re-run checks.
10. Re-evaluate safety.
11. If safe and all gates pass, Copilot may recommend auto-merge eligibility
    only. Only Sattar, or a GitHub workflow explicitly named as approved in this
    file, may enable auto-merge. No auto-merge workflow is currently approved.
12. If still unsafe, stop and ask Sattar.

## Copilot MAY repair
- failing tests, lint errors, type errors, formatting errors
- broken imports, dead code warnings, broken references
- missing rollback instructions, missing validation notes, missing PR
  description details
- small safe bugs inside approved scope
- low-risk docs/test/CI issues
- dependency patch/minor update problems if tests pass

## Copilot MUST NOT repair without Sattar approval
- Supabase production, database migrations, RLS/auth/storage policies
- secrets/.env/config
- payment/checkout/WooCommerce, RFQ/customer forms, email sending
- QuickBooks/accounting
- deploy/publish workflows, branch protection, GitHub permissions, CODEOWNERS
- OWNERSHIP/GOVERNANCE
- machine/shop-floor control, customer messages, production data
- large refactors, anything unclear

## How to repair safely
**Failing checks:** read logs, identify root cause, make smallest fix, run the
same failed check locally if possible, push fix to the same PR branch only if
Sattar allowed Copilot to maintain that PR (otherwise create a separate fix
branch and draft PR), report what changed.

**Blocked files touched:** do not auto-merge; comment why blocked; ask Sattar
for explicit approval. Do not "make safe" by hiding/removing files unless
clearly accidental and reversible.

**Missing rollback/validation:** update PR description or comment with the
missing info; do not change code unless needed.

**Unclear scope:** stop and ask Sattar.

## Auto-merge eligibility after repair
**Copilot may not enable auto-merge by itself.**
**No auto-merge workflow is currently approved.** A workflow becomes approved
only if Sattar names it explicitly in this file and that workflow file is
reviewed and merged manually. Until then, Copilot may only recommend auto-merge
eligibility; it may not enable auto-merge.

Auto-merge is allowed only if ALL are true:
1. PR has label `safe-automerge`.
2. PR has no blocked label: `no-automerge`, `needs-sattar`, `high-risk`,
   `production`, `security`, `database`, `auth`, `payments`, `website-live`,
   `secrets`.
3. PR is not draft.
4. All required checks are green.
5. No unresolved conversations.
6. Required approval exists from Sattar or approved owner.
7. Changed files are only safe paths.
8. No blocked paths changed.
9. PR includes validation result.
10. PR includes rollback command.
11. Copilot did not approve its own PR.
12. Copilot did not add `safe-automerge` label to its own PR.

## Safe paths for auto-merge
Safe paths are never enough by themselves. Blocked paths below always override
safe paths.

- `docs/**`, `README.md`
- `tests/**`, `src/**/*.test.*`, `src/**/*.spec.*`
- small non-production UI copy/style changes in approved modules
- lint/format-only changes
- patch/minor dependency updates after green checks

## Blocked paths for auto-merge
- `supabase/**`, `**/migrations/**`, `**/.env*`, `**/secrets/**`
- `**/auth/**`, `**/rls/**`
- `**/payment/**`, `**/checkout/**`, `**/woocommerce/**`
- `**/rfq/**`, `**/email/**`, `**/send-email/**`
- `**/quickbooks/**`, `**/accounting/**`
- `.github/workflows/**`
- `.github/CODEOWNERS`
- `.github/copilot-instructions.md` - this policy file is never
  safe-automerge eligible; changes to it require Sattar manual review and
  manual merge
- `docs/team/**` - governance, ownership, startup, branch workflow, and agent
  operating docs require Sattar manual review and manual merge
- branch protection / permissions / credentials / production config

## Repair limit
Maximum 2 repair attempts per PR. After 2 failed attempts: stop, comment root
cause, mark `needs-sattar`, do not merge.

## Final report (for every repaired PR)
A) original unsafe reason
B) repair made
C) files changed
D) checks run
E) current risk level
F) auto-merge eligible: yes/no
G) rollback command
H) Sattar action needed
