# Your First PR — GitHub Website Only (No Installs Required)

**Who this is for:** Any new Rebar.Shop team member (approved employee), on day one.
**Where:** `REBAR-SHOP-OS/prompt-forge` ONLY. This is the safe training repo.
**What you need:** A web browser and your own GitHub account. Nothing else. No OpenClaw, no Git, no terminal.

## Safety rules (read first)

- Work ONLY in `prompt-forge`. Do NOT open, edit, or clone Rebar OS Core.
- Do NOT touch Lovable (view only, never edit or publish).
- Do NOT merge anything — not even your own PR. Sattar merges after review.
- Do NOT push to `main` (it is blocked anyway — branch protection is on).
- Use YOUR own GitHub account. Never `rebarshop-24`, never Sattar's logins.
- Docs-only changes for training: touch files under `docs/` or `README.md` only. No code, no config, no workflows.
- Never type passwords, tokens, or keys into any file.

## Step-by-step (website only)

1. Sign in to github.com as **yourself**. Check the avatar in the top-right corner — it must be your username.
2. Go to `https://github.com/REBAR-SHOP-OS/prompt-forge`.
3. Open the `docs/` folder.
4. Click **Add file → Create new file** (top right of the file list).
5. Name the file: `first-pr-<yourname>.md` (example: `first-pr-newdev.md`).
6. Put ONE line in it:
   `Employee PR workflow test completed by <yourname> on <today's date>.`
7. Click **Commit changes...** (green button).
8. In the dialog, choose **"Create a new branch for this commit and start a pull request."**
   Name the branch: `docs/<yourname>-first-pr` (example: `docs/newdev-first-pr`).
9. Click **Propose changes**, then on the next page click **Create pull request**.
   Base must be `main`; do not change it.
10. Wait a few minutes. A check named **`Typecheck · Lint · Test · Build`** runs automatically.
    - Green check = success.
    - You will see **"Merging is blocked"** and **"Review required"**. That is correct and expected.
11. **STOP HERE.** Do not click any merge button. Send Sattar the PR link and wait for review.

**Success looks like:** PR authored by you, CI green, merge blocked pending Sattar's review.
A finished example: PR #21 in this repo.

## If something goes wrong

- Typo in your file? Open your PR → **Files changed** → pencil icon → edit → commit to the **same branch**. The PR updates itself.
- Wrong branch or wrong file? Do not delete anything. Tell Sattar; he will close the PR and clean up.
- Cannot see the repo or a button? Your account may be missing an invite or permission. Contact Sattar. Do not borrow anyone's account.

## OpenClaw comes LATER — not today

Do not install or configure OpenClaw on day one. It is not needed for your first PR.

- OpenClaw setup happens only AFTER Sattar confirms your first website PR was done correctly.
- When that day comes, Sattar will walk you through it with your own accounts and your own OpenClaw profile.
- Never copy Sattar's OpenClaw config, sessions, or secrets. Never use his logged-in agents.
- Until then: GitHub website only.
