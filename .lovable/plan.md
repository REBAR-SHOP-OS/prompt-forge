## Goal
Make the app's entry intro video (`LoginIntro`) display fullscreen, filling the entire screen with no black letterbox bars.

## Change
In `src/components/intro/LoginIntro.tsx`:
- Change the `<video>` className from `h-full w-full object-contain` to `h-full w-full object-cover`.

The container is already `fixed inset-0` (covers the whole viewport). `object-contain` keeps the whole frame visible but adds black bars on the sides; `object-cover` scales the video to fill the screen edge-to-edge (cropping slightly as needed) for a true fullscreen experience.

## Verification
Reload the app / sign-out and sign-in flow to trigger the intro, confirm the video fills the screen with no black bars.

## Note
If you prefer the whole frame always visible (no cropping) instead of edge-to-edge fill, let me know — that's the trade-off with `object-contain` vs `object-cover`.