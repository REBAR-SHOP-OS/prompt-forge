# Highlight Low-Confidence (Possible Mispronunciation) Words in the Transcript

## Goal
When the speech-to-text model is unsure about a spoken word, mark it in the transcript so the user can see exactly where the narration may have a pronunciation problem. Detection is based on the model's per-word confidence (logprobs); flagged words are highlighted inline inside the existing transcript panel.

## How detection works
`openai/gpt-4o-mini-transcribe` can return token-level `logprobs`. A low logprob means the model heard that word unclearly — a strong signal of a garbled or mispronounced word. We convert each token's logprob to a confidence (`exp(logprob)`), group tokens into words, and flag words whose confidence falls below a threshold.

## Changes

### 1. `supabase/functions/video-transcript/index.ts`
- In `transcribeVideo`, request logprobs from the gateway:
  - `form.append('response_format', 'json')`
  - `form.append('include[]', 'logprobs')`
- Change the return type to include token data. Parse `data.logprobs` (array of `{ token, logprob }`). Build a `words` array by:
  - Splitting/accumulating tokens into words on whitespace boundaries (a new word starts when a token begins with a space or newline).
  - For each word, take the minimum token confidence (`Math.exp(logprob)`) as the word confidence.
  - Mark `lowConfidence: confidence < THRESHOLD` (start at ~0.55, tunable).
- If `logprobs` is missing (older response), fall back to returning the plain transcript with no flags (graceful degradation).
- Update the main handler to return `words` alongside `transcript`:
  `return json({ transcript, words, translatedText, targetLanguage })`.
- Keep the translate path unchanged (translations have no confidence data).

Returned shape:
```text
words: Array<{ text: string; lowConfidence: boolean; confidence: number }>
```

### 2. `src/modules/generator-ui/components/TranscriptPanel.tsx`
- Extend `TranscriptResponse` with `words?: { text: string; lowConfidence: boolean; confidence: number }[]`.
- Store `words` in state on the initial transcription.
- Rendering the **Original** language view:
  - If `words` exist, render the transcript as a sequence of `<span>`s. Low-confidence words get a highlight style (amber/warning underline + subtle background) and a `title` tooltip like "Possible pronunciation issue (low confidence)".
  - Use semantic tokens (e.g. `text-amber-300`, `decoration-amber-400/60 underline decoration-dotted`) consistent with the panel's dark theme.
  - If no `words`, fall back to the current plain paragraph.
- For **translated** languages, keep plain text (confidence applies only to the spoken original). 
- Add a small legend/hint line above the text when any low-confidence words exist, e.g. "Highlighted words may be mispronounced in the narration." Only show it in the Original view.

## Verification
- Use `supabase--curl_edge_functions` to call `video-transcript` with a real signed video URL and confirm the response includes a `words` array with `lowConfidence` flags.
- In the preview: open the large preview → transcript icon → confirm uncertain words appear highlighted with a tooltip, and the legend shows when applicable.

## Notes
- Threshold is a heuristic; it can be tuned after seeing real output.
- No new secrets, tables, or dependencies needed.
