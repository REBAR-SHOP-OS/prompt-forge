---
name: gemini-veo-video
description: Reference for generating videos with Google Gemini Veo (Veo 3.1, Veo 3, Veo 2) via the Gemini API — text-to-video, image-to-video, video extension, parameters (aspectRatio, resolution, durationSeconds, personGeneration), long-running operation polling, prompt guide with audio/dialogue cues, and limitations. Use when integrating Veo video generation into an app or edge function.
---

# Gemini Veo Video Generation

Official docs: https://ai.google.dev/gemini-api/docs/video

Veo is asynchronous: every call returns a long-running **operation** that must be polled until `done === true`, then the video bytes are downloaded.

## Models

| Model id | Audio | Inputs | Resolution | Duration |
|---|---|---|---|---|
| `veo-3.1-generate-preview` | Always on | Text, Image, Video (extension) | 720p / 1080p (8s) / 4k (8s) | 4, 6, 8s |
| `veo-3.1-fast-generate-preview` | Always on | Text, Image | 720p / 1080p / 4k | 4, 6, 8s |
| `veo-3.1-lite` | Always on | Text, Image | 720p / 1080p (8s) | 4, 6, 8s |
| `veo-3.0-generate-001` / `…-fast` | Always on | Text, Image | 720p / 1080p (16:9) | 8s |
| `veo-2.0-generate-001` | Silent | Text, Image | 720p | 5–8s |

Frame rate is always 24fps. 1 video per request (Veo 2 supports 2).

## Minimal text-to-video (JavaScript)

```ts
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({}); // reads GEMINI_API_KEY env

let op = await ai.models.generateVideos({
  model: "veo-3.1-generate-preview",
  prompt: `A close up of two people staring at a cryptic drawing on a wall, torchlight flickering.
A man murmurs, "This must be it. That's the secret code." The woman whispers excitedly, "What did you find?"`,
  config: {
    aspectRatio: "16:9",       // or "9:16"
    resolution: "720p",        // "1080p" or "4k" (force durationSeconds:"8")
    durationSeconds: "8",      // "4" | "6" | "8"
    // negativePrompt: "...",
    // personGeneration: "allow_all" | "allow_adult" | "dont_allow",
    // seed: 12345,
  },
});

while (!op.done) {
  await new Promise(r => setTimeout(r, 10000));
  op = await ai.operations.getVideosOperation({ operation: op });
}

await ai.files.download({
  file: op.response.generatedVideos[0].video,
  downloadPath: "out.mp4",
});
```

## REST (use this from Supabase / Lovable Cloud edge functions)

```bash
BASE_URL="https://generativelanguage.googleapis.com/v1beta"

# 1. Kick off (long-running)
op=$(curl -s "$BASE_URL/models/veo-3.1-generate-preview:predictLongRunning" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instances": [{ "prompt": "A cinematic shot of a majestic lion in the savannah." }],
    "parameters": { "aspectRatio": "16:9", "resolution": "720p", "durationSeconds": "8" }
  }' | jq -r .name)

# 2. Poll
while true; do
  s=$(curl -s -H "x-goog-api-key: $GEMINI_API_KEY" "$BASE_URL/$op")
  [ "$(echo "$s" | jq .done)" = "true" ] && break
  sleep 10
done

# 3. Download (URI requires the API key header, follow redirects)
uri=$(echo "$s" | jq -r '.response.generateVideoResponse.generatedSamples[0].video.uri')
curl -L -o out.mp4 -H "x-goog-api-key: $GEMINI_API_KEY" "$uri"
```

## Image-to-video

Pass an `image` object alongside `prompt`. With the JS SDK:

```ts
const op = await ai.models.generateVideos({
  model: "veo-3.1-generate-preview",
  prompt: "Camera slowly dollies in as the subject turns its head.",
  image: { imageBytes: base64Png, mimeType: "image/png" }, // or { gcsUri }
  config: { aspectRatio: "16:9", durationSeconds: "8" },
});
```

For interpolation (Veo 3.1) provide both `image` (first frame) and `lastFrame`. For reference-guided generation provide `referenceImages` (up to 3, Veo 3.1 only). For video extension (Veo 3.1 only, 720p only) pass `video` from a previous operation.

## Key parameters

- `aspectRatio`: `"16:9"` (default) or `"9:16"`.
- `resolution`: `"720p"` (default), `"1080p"`, `"4k"`. 1080p and 4k force `durationSeconds: "8"`. Extension is 720p only.
- `durationSeconds`: `"4" | "6" | "8"` (Veo 3.x), `"5" | "6" | "8"` (Veo 2). Must be `"8"` when using extension, reference images, 1080p or 4k.
- `personGeneration`: `"allow_all"`, `"allow_adult"`, `"dont_allow"`. EU/UK/CH/MENA: Veo 3.x is capped at `"allow_adult"`. Image-to-video / interpolation / reference images: `"allow_adult"` only.
- `negativePrompt`: text describing what to avoid.
- `seed` (Veo 3.x): not deterministic, only nudges results.

## Prompt guide (highlights)

Include: **Subject**, **Action**, **Style**, optional **Camera positioning/motion**, **Composition**, **Focus/lens**, **Ambiance**.

Audio cues (Veo 3.x natively generates audio):
- **Dialogue**: quote the lines — `Woman: "What did you find?"`
- **SFX**: describe explicitly — `tires screeching, engine roaring`
- **Ambient**: describe the soundscape — `a faint eerie hum in the background`

Veo 3.1 sometimes blocks a video due to audio safety; blocked generations are not billed.

## Limitations

- Latency: 11s min, up to ~6min during peaks.
- Server-side video retention: **2 days**. Download within 2 days or it's gone. Extensions count as new generations.
- All videos carry a SynthID watermark.
- Safety + memorization filters can reject prompts/outputs.

## When to use this skill

Trigger whenever the user asks to generate, extend, or animate video with Veo / Gemini video API, or asks about supported resolutions, durations, person-generation rules, or polling patterns. For image generation (Nano Banana / Gemini image) use the image-generation docs instead.
