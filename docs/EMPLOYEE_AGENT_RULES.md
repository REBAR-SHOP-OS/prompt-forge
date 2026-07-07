# Employee Agent Rules — Prompt Forge

Permanent instruction file for every approved Rebar.Shop employee agent working in Prompt Forge.
**Every employee agent must read this file at the start of every task.**

## 1. Scope

- Work only in `REBAR-SHOP-OS/prompt-forge`.
- Do not work in Rebar OS Core unless Sattar explicitly assigns it.
- Do not use Lovable for edits. Lovable is view/reference only.

## 2. Default workflow for clear Prompt Forge tasks

- Do not ask unnecessary questions. If the task is clear and inside scope, start working.
- Create a branch: `agent/coder/<employee-name>-<short-task-name>` (fresh from latest `main`).
- Make the smallest safe change.
- Do not touch unrelated files.
- Run validation:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - Manual check when UI/video behavior changes.
- Commit to the branch.
- Push the branch.
- Open a Pull Request to `main`.
- Stop and send Sattar the PR link.
- **Never merge.**

## 3. PR body must include

- Assigned task from Sattar.
- Summary of changes.
- Files changed.
- Validation results (lint / test / build).
- Manual test result, if applicable.
- Confirmation: no Lovable used.
- Confirmation: no Rebar OS Core changes.
- Confirmation: no secrets changed.
- Rollback plan.
- "Awaiting Sattar review."

## 4. Rollback plan requirement

Every PR must include how to undo the change:

- If simple: "Revert this PR through GitHub."
- If rollback needs DB/storage/manual steps: flag Sattar **before** merge.

## 5. Never do

- Do not merge PRs.
- Do not approve your own PR.
- Do not push to `main`.
- Do not use Lovable to edit or publish.
- Do not touch Rebar OS Core.
- Do not touch secrets, `.env`, credentials, tokens.
- Do not change CI, branch protection, GitHub permissions.
- Do not change Supabase, RLS, migrations, storage policies, edge functions.
- Do not touch NAS, Paperless, Vaultwarden, production deployment.

## 6. Stop and ask Sattar before acting if the task touches

- Rebar OS Core
- Lovable
- Checkout / payment / RFQ / customer forms
- Auth / RLS / database / Supabase
- Storage policies
- Secrets / credentials / `.env`
- Edge functions
- CI or branch protection
- GitHub permissions
- NAS / Paperless / Vaultwarden
- Production deployment

## 7. Identity rule

- Employee PRs must be authored by the employee's own GitHub account.
- If using a terminal, verify with: `gh api user --jq .login`
- It must not be `rebarshop-24` unless Sattar is doing owner/admin work.

## 8. Browser automation rule

- If the tool requires confirmation before **Commit** or **Create Pull Request**, ask for a short confirmation like `0`.
- No confirmation is needed for normal investigation, editing, validation, or PR draft preparation.

## 9. Per-task startup instruction

Every employee agent starts every task by reading this file: `docs/EMPLOYEE_AGENT_RULES.md`.
For a first-ever PR, also follow `docs/FIRST-GITHUB-PR.md` (GitHub website only, no installs).
