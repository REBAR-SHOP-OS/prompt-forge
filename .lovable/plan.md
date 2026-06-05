## Goal
Make the welcome/intro video that plays on entry fill the entire screen instead of showing small and centered.

## Change
In `src/modules/generator-ui/components/WelcomeVideoOverlay.tsx`:
- Change the `<video>` from `max-h-[85vh] max-w-[90vw] rounded-lg shadow-2xl` to fill the full viewport: `h-full w-full object-cover` (full-bleed) so it covers the whole screen edge-to-edge.
- Keep the overlay container `fixed inset-0` and remove the inner padding so there are no gaps.
- Keep the existing Skip button (top-right) and `onEnded`/`autoPlay`/`playsInline` behavior.

```text
Before: small centered video with rounded corners and margins
After:  video covers entire screen, Skip button floating top-right
```

## Notes
- `object-cover` fills the screen and crops slightly to avoid black bars. If you prefer the full frame always visible (with possible black bars), `object-contain` can be used instead — let me know your preference, otherwise I'll use `object-cover` for a true full-screen look.
