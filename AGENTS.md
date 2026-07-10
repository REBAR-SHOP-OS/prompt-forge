# Rebar.Shop Agent Pointer

This repo uses the canonical Rebar.Shop agent operating stack from:

- `REBAR-SHOP-OS/rebar-os-core-29f266f2`
- Canonical rules: Core `main` under `docs/team`

Agents must load the Core repo's `docs/team` policy files before changing this
repo:

1. `docs/team/STARTUP-PROTOCOL.md`
2. `docs/team/AGENT-OPERATING-STANDARD.md`
3. `docs/team/AGENT-ROLLOUT-AUDIT-COMMANDS.md`
4. `docs/team/AGENT-DEPLOYMENT-HANDOFF.md`
5. `docs/team/CLAUDE-DELEGATION.md`
6. `docs/team/CLAUDE-COMMAND-TEMPLATE.md`
7. the active persona file: `START-SATTAR`, `START-ZAHRA`, or `START-RADIN`

Do not treat this pointer as standalone authority. If the Core rules cannot be
loaded, keep work draft-only and stop for Sattar.

## Final Button Rule

Only Sattar personally marks ready, approves, merges, enables auto-merge,
publishes/deploys, changes settings or branch protection, runs production
database actions, and touches secrets. An approval phrase is a decision record,
not delegation of those actions to an agent.

## Required Identity Check

Before any repo write, branch operation, push, PR update, or GitHub API
mutation, verify the active GitHub login:

```powershell
gh api user --jq .login
```

Expected logins:

| Persona | Expected GitHub login |
|---|---|
| Sattar | `rebarshop-24` |
| Zahra | `zahra-rebar-shop` |
| Radin | `radin-ux` |

If identity is wrong, unknown, or unavailable, stop before writing.

## Local Safety Rules

- Keep repair work on a scoped branch, never `main`.
- Open or update draft PRs only.
- Do not mark ready, merge, approve, enable auto-merge, deploy, publish, change
  settings, alter branch protection, change secrets, or use Lovable
  Fix/Publish/Deploy/Sync. Prepare the exact handoff; Sattar performs the final
  action personally.
- Report proof strip: requester, repo, branch, PR, draft/ready state, changed
  files, local checks, GitHub checks, risk, rollback, and approval still needed.
- If ready/merge/deploy/publish is requested, use the Core
  `AGENT-DEPLOYMENT-HANDOFF.md` packet and stop at Sattar's gate.
