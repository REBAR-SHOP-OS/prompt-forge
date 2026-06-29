Problem
--------
`selectedModelId` is hardcoded to `'wan-i2v'` on init, but `selectedModel` (the effective model) falls back to the first Text-to-Video-compatible model when the user is in Text-to-Video mode because `wan-i2v` only supports `i2v`. The dropdown therefore shows "Google Veo 3 Fast" as selected instead of the Wan family.

Goal
----
Ensure the Wan 2.7 family is the default in **both** tabs:
- Image to Video → `wan-i2v`
- Text to Video → `wan-t2v`

Plan
----
1. Add a `toTextToVideoModel(model)` helper (counterpart to the existing `toImageToVideoModel`). It finds the `t2v` sibling in the same provider family, falling back to `wan-t2v` as the last resort.

2. Add a `useEffect` that watches `generationMode` (or `isTextToVideo`). When the mode changes:
   - If entering **Text to Video** and the current `selectedModelId` only supports `i2v`, replace it with the `t2v` counterpart via `toTextToVideoModel`.
   - If entering **Image to Video** and the current `selectedModelId` only supports `t2v`, replace it with the `i2v` counterpart via `toImageToVideoModel`.

3. Keep the initial `useState('wan-i2v')` unchanged so the Image-to-Video tab starts with Wan I2V.

4. Verify the dropdown label and checkmark now correctly reflect the Wan family after tab switches.

No other UI, auth, or backend changes required.