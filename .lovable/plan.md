# Post-login fullscreen intro video with Skip

After a user successfully signs in, show the uploaded "Logo becomes camera shape" video in fullscreen as a one-time intro before the dashboard appears. Provide a clearly visible **Skip** button so the user can jump straight to the app at any time.

## Behavior

- Trigger: shown right after a session becomes active (sign-in or sign-up that returns a session). Not shown on auto-restored sessions from previous days — only when the user just signed in this session.
- Layout: fullscreen black background, video centered and contained (`object-contain`) so nothing is cropped.
- Audio: video plays muted by default (browser autoplay rules) with a small unmute toggle in the corner.
- Skip control: top-right button labeled "Skip ▸" (and keyboard: pressing `Esc` or `Enter` also skips).
- Auto-advance: when the video ends, the dashboard is shown automatically.
- Don't show again in the same browser session — uses `sessionStorage` flag `intro_played`. (Each new sign-in clears the flag so the next login plays it again.)

## Files

1. **Add asset** — copy `Logo_becomes_camera_shape_202605061012.mp4` into `src/assets/intro/login-intro.mp4`.

2. **New component** `src/components/intro/LoginIntro.tsx`
   - Props: `onFinish: () => void`.
   - Renders a fixed fullscreen overlay with the `<video>` (autoplay, muted, playsInline), a Skip button, and a mute toggle.
   - Calls `onFinish` on video end, on Skip click, on `Escape`/`Enter` keydown.

3. **Wire it into the gate** `src/App.tsx`
   - Add state `showIntro` in `Gate`.
   - When `session` becomes truthy AND `sessionStorage.getItem('intro_played') !== '1'`, set `showIntro = true`.
   - In `AuthForm` (sign-in / sign-up success path), set `sessionStorage.removeItem('intro_played')` right before navigating, so a fresh login always replays the intro.
   - Render order in `Gate`:
     - `loading` → LoadingScreen
     - `session && showIntro` → `<LoginIntro onFinish={() => { sessionStorage.setItem('intro_played','1'); setShowIntro(false) }} />`
     - `session` → `<DashboardPage />`
     - otherwise → `<LoginPage />`

## Files touched
- `src/assets/intro/login-intro.mp4` (new, copied from upload)
- `src/components/intro/LoginIntro.tsx` (new)
- `src/App.tsx` (gate logic)
- `src/components/auth/AuthForm.tsx` (clear `intro_played` on successful sign-in/up)
