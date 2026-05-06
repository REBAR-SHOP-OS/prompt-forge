## Goal

The "Prompt" pill (highlighted in orange in the screenshot, next to the submit arrow) is currently a static label. Convert it into a clickable button that takes whatever the user has typed in the prompt textarea and rewrites it into the best possible video-generation prompt using Lovable AI, then replaces the textarea content with the improved version.

## UX behavior

- If the textarea is empty (or only whitespace), the button is disabled.
- On click:
  - Show a loading state on the button (spinner + disabled).
  - Send the current `promptText` to a new edge function.
  - On success: replace `promptText` with the enhanced prompt returned by AI.
  - On error (rate limit 429, credits 402, anything else): show a small inline error / toast in the existing composer error spot. Original prompt is preserved.
- During enhancement, the main "Generate" submit arrow is also disabled to avoid races.

## Technical changes

### 1. New edge function — `supabase/functions/enhance-prompt/index.ts`

- Accepts `POST { prompt: string }`.
- Requires auth (reuses `authenticate` from `_shared/core/auth.ts`).
- Calls Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) with:
  - Model: `google/gemini-3-flash-preview` (default per guidelines).
  - System prompt: "You are an expert prompt engineer for AI video generation. Rewrite the user's prompt into a single, vivid, cinematic, concrete prompt optimized for image-to-video / text-to-video models. Preserve the user's original language (Persian stays Persian, English stays English). Keep it under ~80 words. Output ONLY the rewritten prompt, no preamble, no quotes, no explanation."
  - User message: the raw prompt.
- Reads `LOVABLE_API_KEY` from env.
- Returns `{ enhancedPrompt: string }` on success.
- Surfaces 429 (rate limit) and 402 (credits) with the same status to the client so the UI can show a friendly message.
- CORS via existing `corsHeaders`.
- Add a `[functions.enhance-prompt]` block in `supabase/config.toml` only if needed (default `verify_jwt = true` is fine — we authenticate manually with the user token like other functions).

### 2. Frontend — `src/modules/generator-ui/pages/DashboardPage.tsx`

Around lines 2452–2455, replace the static `<span>Prompt</span>` with a `<button type="button">` that:
- Shows `Sparkles` icon (lucide-react) + "Prompt" text, or `LoaderCircle` spinner while enhancing.
- `disabled` when `promptText.trim().length === 0`, when already enhancing, or when `isSubmitting`.
- `onClick` calls a new local handler `handleEnhancePrompt` that:
  - Sets `isEnhancingPrompt` state to true.
  - Calls `supabase.functions.invoke('enhance-prompt', { body: { prompt: promptText.trim() } })`.
  - On success: `setPromptText(data.enhancedPrompt)`.
  - On 429: set `composerError` to "Rate limit reached. Try again in a moment."
  - On 402: set `composerError` to "AI credits exhausted. Add credits to continue."
  - On any other error: set `composerError` to "Could not enhance prompt. Please try again."
  - In `finally`: set `isEnhancingPrompt` to false.
- Add new state: `const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false)`.
- Also disable the submit button while `isEnhancingPrompt`.

Visual styling stays consistent with current pill: `inline-flex h-10 ... rounded-full border border-[#2a2d32] bg-black/20 ...`, plus hover/active states (`hover:border-white/20 hover:bg-white/[0.05]`) and `disabled:opacity-40 disabled:cursor-not-allowed`.

## Files touched

- **New**: `supabase/functions/enhance-prompt/index.ts`
- **Edited**: `src/modules/generator-ui/pages/DashboardPage.tsx`

No DB migration, no new secrets (Lovable AI uses the auto-provisioned `LOVABLE_API_KEY`), no new packages.

## Acceptance check

1. Type a rough Persian or English prompt in the textarea.
2. Click the "Prompt" pill — a spinner appears briefly.
3. The textarea content is replaced with a polished, cinematic version of the same idea, in the same language.
4. Empty textarea → button is disabled.
5. If AI gateway returns 429/402, a friendly inline error appears and the original prompt is preserved.
