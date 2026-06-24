## Expected outcome
Every card in a project must use the same Character Sheet identity, including the same face/body/outfit/clothing details, so card 2+ cannot silently drift away from card 1.

## What I found
- The frontend sends `referenceImageUrls` when creating cards, but the backend does not persist those reference URLs on the job row.
- Because the reference is not persisted, regenerate/retry and later lifecycle operations can lose the Character Sheet anchor.
- For Wan, the Character Sheet is currently only added as prompt text because Wan has no separate reference-image channel in this implementation; this is weak and `prompt_extend: true` can further rewrite the prompt.
- Veo receives `referenceImages`, but the request does not force the 3.1 reference-capable model during routing unless another condition requires it.

## Plan
1. **Persist the project Character Sheet on every job**
   - Add a safe `reference_image_urls` metadata column to `generator_generation_jobs`.
   - Store the filtered Character Sheet URLs during `createJob`.
   - Return that metadata from job list/get endpoints so regenerated cards inherit the exact same character anchor.

2. **Make regeneration preserve the same character**
   - Update the frontend job contract to include `reference_image_urls`.
   - In `regenerateCard`, send `job.reference_image_urls` first, falling back to the current project Character Sheet.
   - This prevents edits/retries from dropping the anchor.

3. **Strengthen prompt anchoring for every provider**
   - Replace the current soft prefix with a stricter English identity-lock block that explicitly says: same face, same blue robot body, same black T-shirt, same orange logo, same gray cargo pants, same shoes/accessories; do not change wardrobe unless the user explicitly requests it.
   - Keep user prompt content intact after this block.

4. **Fix provider-specific weak points**
   - For Wan: disable provider prompt expansion when a Character Sheet reference exists, because expansion can reinterpret/change clothing.
   - For Wan/local fallback: include the reference URL and strict identity-lock prompt, while keeping the previous-frame start image as the motion bridge.
   - For Flow/Veo: route reference-image jobs to the reference-capable Veo 3.1 path and attach `referenceImages` as inline data.

5. **Add observability without leaking secrets**
   - Log only job id, provider/model, and reference count, never the actual signed URLs.
   - This lets us confirm card 2+ was submitted with a Character Sheet anchor.

6. **Validate safely**
   - Run TypeScript validation.
   - Run targeted backend tests if available.
   - After deployment, verify a two-card generation request logs `referenceCount: 1` for both cards and that the second card request keeps the persisted reference metadata.

## Risks / safeguards
- Existing jobs without `reference_image_urls` remain compatible.
- No credit ledger changes.
- No destructive data changes.
- If a provider still ignores visual references, the app will at least preserve and resend the strongest available anchor consistently instead of losing it between cards.