## Goal

When the user signs in, the dashboard must open in the empty "Start forging a prompt" state (like screenshot 3) instead of auto‑previewing the most recent existing job (screenshot 1). The HISTORY panel should also show 0, exactly like the post‑Start‑Over state.

Library / Final Film cards must NOT be deleted — same rule that already applies to Start Over. No server changes, no data deletion.

## Approach

Reuse the existing Start‑Over mechanism (`workspaceHiddenJobIds` + `previewDismissed` + `lockedProjectRatio` reset). On the first dashboard mount after a fresh sign‑in, run that same reset once.

Trigger detection uses a `sessionStorage` flag:
- Key: `workspace-fresh-login` (single global key, no userId needed)
- Set by the sign‑in flow right after a successful login.
- Consumed (deleted) by the dashboard the first time it loads jobs after login.

This way:
- Fresh login → empty workspace.
- In‑tab page refresh after login → workspace is preserved (flag already consumed).
- Sign‑out + sign‑in again in same tab → flag re‑set, empty workspace again.

## Changes (frontend only)

1. **`src/components/auth/AuthForm.tsx`**
   - In the successful login branch (and successful signup branch when a session is returned), call:
     `sessionStorage.setItem('workspace-fresh-login', '1')`
   - Placed alongside the existing `sessionStorage.removeItem('intro_played')` line.

2. **`src/modules/generator-ui/pages/DashboardPage.tsx`** — inside `loadVideoJobs` (around line 1052), after `setGeneratedVideos(hydratedJobs)`:
   - If `sessionStorage.getItem('workspace-fresh-login') === '1'`:
     - Build `nextHidden = new Set(workspaceHiddenJobIds)` and add every `hydratedJobs[i].id`.
     - `setWorkspaceHiddenJobIds(nextHidden)` and `persistWorkspaceHiddenJobIds(nextHidden)`.
     - `setPreviewVideoId(null)`, `setPreviewDismissed(true)`.
     - `setLockedProjectRatio(null)` + `persistLockedRatio(null)`.
     - `sessionStorage.removeItem('workspace-fresh-login')`.
   - Guard the whole block in `try/catch` for sessionStorage access.

## What is intentionally NOT changed

- No edits to job‑orchestrator, edge functions, storage, RLS, or any backend logic.
- `visibleVideos` / Library remain untouched — Final Film and approved cards still appear in Library.
- Composer state, transitions, music, voiceover are not reset (login is not the same as Start Over for those — only the auto‑preview + history visibility are reset, matching screenshot 3).
- No deletion of any user data.
