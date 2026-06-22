## Goal

Put a clear **narration icon** on every working-clip card so the user can instantly see what narration / spoken voiceover belongs to that card.

## Where the narration comes from

Each card's narration is already embedded **inside that card's scene prompt** (`job.input_prompt`). The scenario/ad writer weaves spoken lines into the text as quoted dialogue — e.g. `Character says: "..."`, plain `"..."` quotes, or `«...»` (Persian/Arabic). There is no separate narration column, so the icon will surface the spoken lines extracted from the prompt (and gracefully fall back when none are found).

## Changes (frontend only, in `src/modules/generator-ui/pages/DashboardPage.tsx`)

1. **Narration extractor helper** — a small pure function `extractNarration(prompt: string): string[]` that pulls spoken lines from a prompt:
   - Matches `says: "…"` / `: "…"` patterns and standalone quotes `"…"`, `“…”`, `«…»`.
   - Returns the de-duplicated list of spoken lines. If none are found, returns `[]`.

2. **Narration icon on each video clip card** — in the card action row (next to the existing Pencil / Regenerate / Trim icons, around line 9272–9424):
   - Add a button with a speech icon (`MessageSquareQuote` from lucide-react, already the icon style used in the app) — tinted to stand out (e.g. indigo/violet accent).
   - `title`/`aria-label`: "Narration for this card".
   - Clicking it opens a small **popover/dialog** showing the extracted narration lines for that card. When no spoken lines are detected, show a short hint ("No narration detected in this card's prompt") so the user knows this card has no scripted voiceover yet.
   - The icon shows a subtle dot/highlight when the card actually contains narration, so the user can tell at a glance which cards have a script.

3. **Narration viewer** — reuse the existing lightweight prompt-viewer dialog pattern already in the file (`setPromptViewer`) by adding an analogous `narrationViewer` state + a small `Dialog`, OR render the lines in a shadcn `Popover` anchored to the icon. Keep it RTL-friendly (`dir="auto"`) so Persian/Arabic narration renders correctly.

## Verification

- Build passes.
- Open the preview, generate/inspect a multi-scene project: each clip card shows the new narration icon; clicking it reveals that card's spoken lines; cards with quoted dialogue show the highlight, cards without show the empty-state hint.
- Confirm Persian narration text displays right-to-left in the popover.

## Notes
- Pure presentation change — no backend, schema, or generation-logic changes.
- Does not alter prompt text or the generation flow; it only reads and displays what's already on each card.