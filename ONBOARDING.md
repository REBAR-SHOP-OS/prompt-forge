# Rebar.Shop — Employee Developer Portal

## 1. Welcome / Start Here
You work through **OpenClaw + GitHub**, using **your own accounts**.
You never use Sattar's accounts, and you never edit Lovable.
Work through this page top to bottom. If anything fails, see **Support** at the bottom.

## 2. Approved users
| Name | Email |
|---|---|
| Sattar | `sattar@rebar.shop` |
| Radin | `radin@rebar.shop` |
| Zahra | `zahra@rebar.shop` |

Only approved users above may use OpenClaw for Rebar.Shop work.

## 3. Login checklist (do these first)
- [ ] I am using **my own Google / Gmail / company email** (from the approved list above).
- [ ] I have **my own GitHub account** and accepted the invite to `REBAR-SHOP-OS`.
- [ ] I ran `gh auth login` as **myself** — check: `gh api user` shows **my** GitHub username (NOT `rebarshop-24`).
- [ ] I set my git identity: `git config --global user.name` / `user.email` = **me**.
- [ ] I have **my own Claude / ChatGPT / LLM login** in **my** OpenClaw (not Sattar's session).
- [ ] I have **my own OpenClaw profile/install** — I did **not** copy Sattar's config or secrets.
- [ ] Confirmed: I am **not** using Sattar / rebarshop-24 for anything.

## 4. Work rules (must follow)
- **No Lovable editing.** **No Lovable publish.** Lovable is view/reference only.
- **No direct push to `main`.** **Branch + PR only.**
- **CI must pass** before a PR can merge.
- **Sattar approval is required** before any merge or deploy.
- **No secrets** — do not read or use credential/secret files.
- **No NAS / Paperless / Vaultwarden / OpenClaw config** changes.
- **No checkout / cart / payment / RFQ / customer-form** changes unless a task specifically assigns it.
- No force-push. No production deploy.

Full detail: see `EMPLOYEE_WORKFLOW.md` (workflow rules) and `TEAM_WORKTREE_PROTOCOL.md` (worktree mechanics).

## 5. Your first training task
- Repo: **`REBAR-SHOP-OS/prompt-forge`**
- Branch: `agent/coder/<employee-name>-readme-test` (fresh from `main`)
- Change: add ONE line to `README.md` (or a file under `docs/`):
  `Employee PR workflow test completed by <employee-name> on <date>.`
- Then: commit -> push branch -> **open a PR to `main`** -> wait for CI -> **do NOT merge**.
- Success = your PR is authored by **you**, CI is green, and merge is **blocked** until Sattar reviews.

## 6. Demo to look at first
See **prompt-forge PR #21** — it shows the whole flow: branch -> isolated worktree ->
PR -> CI passing -> **merge blocked pending Sattar review**. Copy that pattern.
Link: https://github.com/REBAR-SHOP-OS/prompt-forge/pull/21

## 7. Rebar OS Core (restricted)
`rebar-os-core-29f266f2` is **restricted** until your per-employee identity is confirmed.
Do not work in it yet. Start and stay in `prompt-forge` for training.

## 8. Support
Login or access problems -> **contact Sattar directly.**
Do **not** borrow another account, and do **not** work around access — wait until it is fixed.


## 9. Mandatory scope selection (before ANY task)
Before starting any task, the agent must **show the work-area list and ask which one to work on**. Do not assume the target.

**Available work areas:**
1. `prompt-forge` — employee training / prompt tools / docs-first tasks
2. `rebar-os-core-29f266f2` — restricted production app, **Sattar approval required**
3. Lovable Cloud — **view/reference only**, no direct editing/publishing
4. Rebar.Shop website / WooCommerce — production website, **restricted**
5. NAS / NAS2 / backups — infrastructure, **owner-only**
6. Paperless — infrastructure/document system, **owner-only**
7. Vaultwarden — password manager, **owner-only**
8. OpenClaw config / agents / worktrees — **owner-only**
9. Local AI / PersonaPlex / Ollama / ComfyUI — local AI systems, **restricted**
10. GitHub org / branch protection / repo permissions — **owner-only**
11. Supabase / Lovable Cloud secrets / Edge Functions — **owner-only**
12. QuickBooks / finance / accounting — **restricted**
13. RingCentral / Gmail / Workspace integrations — **restricted**

The agent must ask: **"Which work area do you want to work on?"**

**Rules:**
- Do not assume the target. Do not start until Sattar or the assigned employee chooses one work area.
- If the work area is restricted or owner-only, **stop and ask for Sattar approval**.
- Do not mix unrelated areas in one task.
- Do not touch NAS, secrets, Lovable, production, finance, or Rebar OS Core unless that area is explicitly selected AND approved.
- **For employees, the default allowed area is `prompt-forge` only** unless Sattar assigns another area.
