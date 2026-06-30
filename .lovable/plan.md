## Goal
Make voiceover generation work again. Keep the current UI, character voices (Puck, Leda, etc.), tones, and preview samples exactly as they are.

## Root cause
The `tts-generate` edge function calls Google's Gemini TTS API directly using the `GEMINI_API_KEY` secret. The edge logs show every request failing with:

```text
400 — "API key not valid. Please pass a valid API key." (API_KEY_INVALID)
```

The configured `GEMINI_API_KEY` is invalid or expired. Nothing is wrong with the function code — it just has a dead key. So no code changes are needed; the key must be replaced.

## Fix (the only required step)
1. Open the secure secret form so you can paste a **valid Google AI Studio API key** into `GEMINI_API_KEY`.
   - Get the key from Google AI Studio → "Get API key" (aistudio.google.com/apikey).
   - The key must belong to a project where the Generative Language API is enabled and the **Gemini 2.5 Flash Preview TTS** model (`gemini-2.5-flash-preview-tts`) is available.
2. After you save the new key, I verify the fix by calling `tts-generate` directly with a short test line and confirming it returns audio (HTTP 200 with `audioBase64`) instead of the 400 error.

## Verification
- Direct edge-function smoke test (`tts-generate`) returns audio, not a provider error.
- "Generate voiceover" in the dialog produces a playable clip.

## Notes
- No code, UI, voice catalog, or preview-sample changes — those all keep working once the key is valid.
- If the new key still fails, the most likely causes are: the Generative Language API not enabled on that Google project, billing not set up, or the TTS model not enabled for that key — I'll surface the exact provider message from the logs to pinpoint it.