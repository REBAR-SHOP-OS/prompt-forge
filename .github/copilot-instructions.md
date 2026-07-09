# COPILOT SAFE REPAIR POLICY — Rebar.Shop

## Goal
Copilot may debug and repair unsafe PRs, but it may not merge unsafe PRs.

## Core rule
If a PR is not safe, Copilot must repair it or stop. **Never merge unsafe PRs.**

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
11. If safe and all gates pass, auto-merge may be enabled only under the safe-automerge policy.
12. If still unsafe, stop and ask Sattar.

## Copilot MAY repair
- failing tests, lint errors, type errors, formatting errors
- broken imports, dead code warnings, broken references
- missing rollback instructions, missing validation notes, missing PR description details
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
**Failing checks:** read logs, identify root cause, make smallest fix, run the same failed check locally if possible, push fix to the same PR branch only if Sattar allowed Copilot to maintain that PR (otherwise create a separate fix branch and draft PR), report what changed.

**Blocked files touched:** do not auto-merge; comment why blocked; ask Sattar for explicit approval. Do not "make safe" by hiding/removing files unless clearly accidental and reversible.

**Missing rollback/validation:** update PR description or comment with the missing info; do not change code unless needed.

**Unclear scope:** stop and ask Sattar.

## Auto-merge eligibility after repair
Auto-merge is allowed only if ALL are true:
1. PR has label `safe-automerge`.
2. PR has no blocked label: `no-automerge`, `needs-sattar`, `high-risk`, `production`, `security`, `database`, `auth`, `payments`, `website-live`, `secrets`.
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
- `docs/**`, `README.md`, `.github/copilot-instructions.md`
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
- `.github/workflows/*deploy*`, `.github/workflows/*publish*`, `.github/workflows/*production*`
- `.github/CODEOWNERS`
- `docs/team/OWNERSHIP.md`, `docs/team/GOVERNANCE.md`, `docs/team/AGENT-OPERATING-STANDARD.md`
- branch protection / permissions / credentials / production config

## Repair limit
Maximum 2 repair attempts per PR. After 2 failed attempts: stop, comment root cause, mark `needs-sattar`, do not merge.

## Final report (for every repaired PR)
A) original unsafe reason
B) repair made
C) files changed
D) checks run
E) current risk level
F) auto-merge eligible: yes/no
G) rollback command
H) Sattar action needed
