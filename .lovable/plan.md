## Goal
Add a free-form "Your prompt" input to the Product Ad Scenario dialog. When the user types their own prompt, picks a camera style and duration, then clicks Generate, the prompt is rewritten by AI according to the chosen duration + camera style.

## Changes — `src/modules/generator-ui/components/ProductAdDialog.tsx`
1. Add state `const [userPrompt, setUserPrompt] = useState('')`.
2. Add a new "Your prompt" `Textarea` section (above or below Description) where the user writes their own idea, e.g. placeholder "Write your own prompt / idea — it will be rewritten for your duration and camera style…".
3. In `generate()`, build the `idea` sent to the `scenario-write` function from the user's prompt when present:
   - If `userPrompt` is filled → `idea = userPrompt.trim()` (plus product name context if available).
   - Otherwise keep current behavior (product name based).
   - Continue passing `durationSeconds: duration` and `cameraStyle` so the rewrite is tuned to both (already supported server-side).
4. Update `canGenerate` and the empty-input guard so a non-empty `userPrompt` alone is enough to generate (currently requires product name or image).
5. Add `setUserPrompt('')` to `reset()`.

## Result
The user writes their prompt, selects camera style + duration, clicks Generate (the wand icon), and gets back a rewritten cinematic scenario tuned to that duration and camera style — shown in the existing results area and usable via "Use as prompt".

## Notes (technical)
No edge-function change required: `scenario-write` already incorporates `idea`, `durationSeconds`, and `cameraStyle` into the system prompt. This is a frontend-only change.
