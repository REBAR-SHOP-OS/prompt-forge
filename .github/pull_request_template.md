# Pull Request Proof Strip

Fill this before requesting review. If a section cannot be answered, keep the PR draft and say why.

## 1. Request and Scope
- Requester / source:
- Persona / agent:
- Target repo / system:
- Branch:
- PR state: Draft
- Change type: docs / tests / app / data / settings / deploy / other
- Related issue / PR:

## 2. What Changed
- Files changed:
- User-facing behavior:
- Data / config / customer impact:
- Security / privacy impact:

## 3. Safety Gates
- [ ] GitHub identity verified with `gh api user --jq .login`
- [ ] No secrets, tokens, PATs, API keys, passwords, cookies, sessions, recovery codes, or private keys were requested or pasted.
- [ ] No hidden merge, auto-merge, deploy, publish, branch-protection, repo-settings, or secrets change.
- [ ] No Lovable Fix, Publish, Deploy, Sync, or GitHub push from Lovable unless Sattar approved that exact action.
- [ ] PR remains draft unless Sattar explicitly approved marking it ready.
- [ ] Sensitive paths are disclosed and manually reviewed if touched: `.github/**`, `supabase/**`, auth, payments, runtime, deploy, environment, or config.

## 4. Validation Evidence
- Local checks:
- GitHub checks:
- Preview / screenshot / handoff link:
- Known failing checks and root cause:
- Manual test notes:

## 5. Rollback
- Code rollback command:
- Data rollback:
- Deployment rollback:

## 6. Approval Needed
- Sattar approval needed for:
- Exact action requested now:
- Actions not requested:
  - merge
  - enable auto-merge
  - deploy / publish
  - repo settings / secrets / branch protection
  - mark ready for review
  - close conflicting PRs

## 7. Deployment Handoff
Complete only if release is requested.

- Environment:
- Commit:
- Required post-merge action:
- Owner who will press deploy / publish:
- Evidence to collect after release:
