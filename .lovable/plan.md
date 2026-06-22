# Click a Flagged Word to Hear Its Correct Pronunciation

## Goal
In the transcript panel, the low-confidence (possibly mispronounced) words are already highlighted. Make each highlighted word clickable: clicking it plays a clear, correct text-to-speech pronunciation of that word.

## Approach
Reuse the existing `tts-generate` edge function (Gemini TTS → base64 WAV). On click, the panel sends the single word, decodes the returned WAV to an audio blob, and plays it. Audio per word is cached so repeat clicks are instant and not re-billed.

## Changes — `src/modules/generator-ui/components/TranscriptPanel.tsx`

1. **State & refs**
   - `pronouncing: number | null` — index of the word currently loading TTS (for a spinner).
   - `playingWord: number | null` — index currently playing (for visual state).
   - `audioCache = useRef<Map<string, string>>` — maps lowercased word → object URL of generated WAV.
   - `audioRef = useRef<HTMLAudioElement | null>` — single reused `<audio>` element.

2. **`playPronunciation(word, index)` handler**
   - Normalize the word (strip surrounding punctuation, e.g. `Stirrup,` → `Stirrup`).
   - If cached, play immediately. Otherwise:
     - `setPronouncing(index)`
     - `supabase.functions.invoke('tts-generate', { body: { text: word, gender: 'female', tone: 'narrative' } })`
     - Convert `data.audioBase64` (+ `data.mimeType`) to a Blob → object URL, store in cache.
     - Play via the shared audio element; set `playingWord`, clear it on `ended`.
   - Errors → `toast.error('Could not play pronunciation.')` (sonner) and clear loading.
   - Pause/cancel any currently-playing audio before starting a new word.

3. **Render the highlighted words as buttons**
   - Change each low-confidence `<span>` into a `<button type="button">` that calls `playPronunciation`.
   - Keep the amber highlight styling; add `cursor-pointer`, hover emphasis, and a tiny inline speaker icon (`Volume2` from lucide-react) after the word. While that word is loading, show `Loader2` spinner instead; while playing, accent the icon.
   - Update the tooltip/title to "Click to hear the correct pronunciation".
   - Update the legend text to: "Highlighted words may be mispronounced — click one to hear the correct pronunciation."

4. **Cleanup**
   - On unmount, revoke cached object URLs and pause audio.

## Notes
- `tts-generate` already requires auth; `supabase.functions.invoke` sends the session token automatically.
- Only Original-view highlighted words are clickable (translations have no confidence/word data).
- No backend changes, no new secrets, no schema changes.

## Verification
- Open large preview → transcript icon → click a highlighted word → confirm audio plays, spinner shows while generating, and a second click plays instantly from cache.
