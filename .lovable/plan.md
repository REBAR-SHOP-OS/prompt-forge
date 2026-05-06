## Goal

When the user clicks the **Prompt** (Sparkles ✨) button to enhance their text, instead of immediately enhancing, show a small popover with **two icons / options**:

1. **No narrator** (icon: `MicOff`) — Enhance the prompt with a strong constraint that the generated video must contain **no narrator, no voice-over, no spoken dialogue, no on-screen character speaking, no lip-sync**. Sound design like ambient/music is allowed; speech is forbidden.

2. **With narrator** (icon: `Mic`) — Open a small inline textarea labeled "متن راوی" / "Narrator script". The user types the exact words the narrator should say. On submit, the prompt is enhanced so the resulting video is built **around that narrator script** (timing, mood, scene matches the words; on-screen character or voice-over delivers exactly that text).

Both paths replace `promptText` with the enhanced result, just like today.

## UX flow

```
[Prompt ✨] click
   ↓
popover opens above the button:
  ┌──────────────────────────────────┐
  │  🎙️❌  No narrator                │
  │  🎙️    With narrator              │
  └──────────────────────────────────┘

→ "No narrator" → calls enhance-prompt with mode="silent" → fills prompt
→ "With narrator" → expands to a textarea + "Apply" button
                    → on Apply: calls enhance-prompt with mode="narrated"
                      and narratorScript=<user text> → fills prompt
```

If the prompt textarea is empty, the popover still works for "With narrator" (script alone is enough); for "No narrator" we keep the current behavior of requiring some seed text in the prompt.

## Technical changes

### Edge function: `supabase/functions/enhance-prompt/index.ts`

Accept two new optional fields in the request body:
- `mode?: "silent" | "narrated"` (default = current behavior, unchanged)
- `narratorScript?: string` (required when `mode === "narrated"`)

Branch the system prompt:

- **mode = "silent"** — append to system prompt:
  > "CRITICAL CONSTRAINT: The generated video MUST contain absolutely no narrator, no voice-over, no spoken dialogue, no character speaking on camera, and no lip movement. Do not describe any speech, narration, or talking. Visual storytelling and ambient/music sound design only. Explicitly add 'no narration, no dialogue, no voice-over, no talking, no lip-sync' to the prompt."

- **mode = "narrated"** — append:
  > "The generated video MUST feature a narrator (voice-over or on-camera speaker) reading the following script verbatim: \"<narratorScript>\". Build the visual scene, pacing, camera, and mood to match these exact words. Mention 'voice-over narration delivering the script: ...' inside the prompt and keep the script wording intact and in its original language."

The model still returns a single rewritten prompt under ~80 words (relax to ~120 words for narrated mode so the script fits).

Validation: `narratorScript` ≤ 1500 chars; reject `mode === "narrated"` with empty script (400).

### Frontend: `src/modules/generator-ui/pages/DashboardPage.tsx`

1. Import `MicOff`, `Mic` from `lucide-react`.
2. Add state:
   - `isPromptMenuOpen: boolean`
   - `narratorMode: "idle" | "input"` (controls whether the script textarea is showing inside the popover)
   - `narratorScript: string`
3. Wrap the existing "Prompt" button in a `Popover` (already used elsewhere via `@/components/ui/popover`):
   - `PopoverTrigger`: the existing `<button>` styled as today.
   - `PopoverContent`: small panel (w-72) with two list-button rows ("No narrator" + "With narrator"), and conditionally a textarea + Apply button when "With narrator" is selected.
4. Refactor `handleEnhancePrompt` into:
   - `handleEnhanceSilent()` — calls the edge function with `mode: "silent"`, closes popover.
   - `handleEnhanceNarrated()` — validates `narratorScript`, calls with `mode: "narrated", narratorScript`, closes popover and resets the script.
5. Loading spinner stays the same (`isEnhancingPrompt`); disable both options while loading.
6. Reset popover state on close.

### No DB / migration / storage changes.

## Out of scope

- Persisting the narrator script across sessions.
- Actually producing audible TTS — this only steers the video-generation prompt; whether the underlying video model honors the speech depends on the provider.
