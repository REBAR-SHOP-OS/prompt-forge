## Problem

When you switch away from the Chrome tab and come back, the dashboard returns to the empty "Start forging a prompt" state and your loaded clips/images disappear.

## Root cause

Chrome aggressively backgrounds inactive tabs. When the tab regains focus, the Supabase auth client auto-refreshes the access token and fires a `TOKEN_REFRESHED` / `SIGNED_IN` event. `AuthProvider` (`src/core/auth/AuthProvider.tsx`) calls `setSession(sess)` with a brand-new session object every time, so the `session` reference in context changes.

`DashboardPage.tsx` has two effects whose dependency arrays include the whole `session` object:

```text
useEffect(() => {                         // line 1102
  if (authLoading) return
  setGeneratedVideos([])
  setIsLibraryLoading(false)
  setVideoColumnMessage(null)
}, [authLoading, session])

useEffect(() => {                         // line 1111
  if (authLoading || !userId) return
  setUserImages([])
}, [authLoading, userId])
```

Because `session` is a new reference after every token refresh, the first effect re-runs and wipes `generatedVideos` (and resets the column message), which is exactly the empty state seen in the screenshot. The second one already keys off `userId` so it's safe, but the first one is the culprit.

## Fix (frontend only, presentation layer)

Convert both "reset on session start" effects to run only when the **identity of the logged-in user actually changes** (login / logout / account switch), not on every token refresh.

Implementation in `src/modules/generator-ui/pages/DashboardPage.tsx`:

1. Replace the `[authLoading, session]` dependency with `[authLoading, userId]` for the workspace-reset effect.
2. Track the last user id we initialized for in a `useRef<string | null>(null)`. Only run the reset block when `userId` transitions to a different non-null value (or to `null` on sign-out). This guarantees that:
   - First load after login → workspace resets once (existing behavior).
   - Token refresh on tab refocus → no-op (bug fixed).
   - Switching accounts → workspace resets.
3. Apply the same `ref`-guarded pattern to the user-images reset effect for consistency, so a future change to its deps can't reintroduce the same bug.

No changes to `AuthProvider`, no backend changes, no behavior change for actual login/logout.

## Verification

- Open the app, load some content, switch to another Chrome tab for ~1 minute, switch back → workspace and images remain intact.
- Sign out and sign back in → workspace resets to empty as before.
- Console shows no auth errors and no extra renders beyond the auth state change itself.
