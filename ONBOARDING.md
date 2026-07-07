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
