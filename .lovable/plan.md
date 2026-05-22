## Expected outcome

Final Film should no longer bake frozen sections into the exported video, and every video card should either show a real playable preview or a clear recoverable loading/error state instead of an empty 0:00 grey player.

## Root cause to address

The current Final Film path records source clips by playing `<video>` elements into a canvas. That can still freeze when the browser decoder/network stalls: the recorder keeps running while the video frame is not advancing, so duplicated frames get permanently encoded. Separately, cards render `<video controls>` as soon as a URL is resolved, but they do not validate that metadata/duration loaded successfully; when the media fails, the browser shows a blank player at `0:00`.

## Implementation plan

1. **Make merge input deterministic before recording**
   - Add a preflight validator in `mergeVideos.ts` that waits for `loadedmetadata`, verifies duration and dimensions, seeks to the first real frame, and rejects bad/empty sources before MediaRecorder starts.
   - During recording, pause capture timing when a clip stalls instead of letting the canvas recorder encode the same frame for seconds.
   - If a clip cannot recover, fail Final Film with a specific message naming the bad clip, rather than exporting a frozen film.

2. **Use frame-driven recording instead of play-and-hope timing**
   - Replace the current `video.play() + whenEnded()` dependency with a deterministic seek/frame loop for each clip where possible: advance by fixed 30fps timestamps, draw the decoded frame, and let canvas capture each frame consistently.
   - Keep transitions supported by drawing transition frames against known timestamps, not live playback timing.
   - Keep audio mixing unchanged where possible, but avoid letting audio/live playback control visual frame progression.

3. **Harden card playback previews**
   - Update `PlayableVideo` so it tracks `loading`, `ready`, and `error` states based on `loadedmetadata`, `canplay`, and `error` events.
   - Do not show native controls until metadata is valid; show a compact loader first.
   - If playback metadata fails, retry once through the proxy/raw fallback path and then show a clear “video unavailable” state instead of a 0:00 blank card.

4. **Feed cards only validated URLs**
   - In `DashboardPage.tsx`, avoid passing `undefined` or unresolved URLs into `PlayableVideo` for completed cards.
   - Use the resolved playable URL consistently for card thumbnails, live preview, trim, and Final Film inputs so the UI and merger are using the same source.

5. **Validation**
   - Run the focused test/build check available in the project harness after changes.
   - Verify the relevant source paths: Final Film generation now fails fast on bad sources, does not encode during stalls, and cards no longer render an empty 0:00 player for unresolved media.

## Safety notes

- No database/schema changes are needed.
- No destructive cleanup or deletion will be added.
- Existing saved clips and library entries remain untouched; this is a frontend media-pipeline hardening change only.