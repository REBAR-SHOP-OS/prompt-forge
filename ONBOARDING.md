# Rebar.Shop — Employee Developer Portal

## 1. Welcome / Start Here
Your first day uses the **GitHub website only** — no installs, no CLI, no OpenClaw.
You always work with **your own accounts**, you never use Sattar's accounts, and you never edit Lovable.
Work through this page top to bottom. If anything fails, see **Support** at the bottom.

## 2. Approved users
Only **approved Rebar.Shop employees** (for example, Employee A and Employee B) and the owner (Sattar) may work in this repo.
The current approved list is kept privately by Sattar — if you are unsure whether you are approved, ask him directly.
Approved employees receive a GitHub invite to `REBAR-SHOP-OS` at their own account.

## 3. Day one — your first PR (GitHub website only)
Follow **[docs/FIRST-GITHUB-PR.md](docs/FIRST-GITHUB-PR.md)** step by step. It is the complete day-one guide.

What you need:
- [ ] My **own GitHub account**, with the invite to `REBAR-SHOP-OS` accepted.
- [ ] I am signed in to github.com as **myself** (check the avatar top-right).
- [ ] I am **not** using `rebarshop-24`, Sattar's logins, or anyone else's session.

Success = a PR **authored by your own account** (NOT `rebarshop-24`), CI green, and merge **blocked pending Sattar review**.

## 4. Work rules (must follow)
- **No Lovable editing.** **No Lovable publish.** Lovable is view/reference only.
- **No direct push to `main`.** **Branch + PR only.**
- **CI must pass** before a PR can merge.
- **Sattar approval is required** before any merge or deploy.
- **No secrets** — do not read or use credential/secret files. Never put names, emails, passwords, or keys into public docs.
- **No NAS / Paperless / Vaultwarden / OpenClaw config** changes.
- **No checkout / cart / payment / RFQ / customer-form** changes unless a task specifically assigns it.
- No force-push. No production deploy.

Full day-one detail: **[docs/FIRST-GITHUB-PR.md](docs/FIRST-GITHUB-PR.md)**. OpenClaw workflow documentation is provided by Sattar later, during supervised OpenClaw setup (see section 6).

## 5. Demo to look at first
See **prompt-forge PR #21** — it shows the flow: branch -> PR -> CI passing -> **merge blocked pending Sattar review**.
Note: that demo PR was authored by the shared admin account for demonstration. **Your PR must be authored by your own account.**
Link: https://github.com/REBAR-SHOP-OS/prompt-forge/pull/21

## 6. OpenClaw — later setup only (NOT day one)
Do **not** install or configure OpenClaw on day one. It is not needed for your first PR.
- OpenClaw setup happens only **after** Sattar confirms your first website PR was done correctly.
- Setup is done **with Sattar**, using your own logins: your own GitHub (`gh auth login` as yourself — `gh api user` must show YOUR username, not `rebarshop-24`), your own git identity (`git config --global user.name` / `user.email` = you), your own LLM login, and your **own OpenClaw profile/install**.
- Never copy Sattar's OpenClaw config, sessions, or secrets.

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
