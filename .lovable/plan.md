## Goal

In the Scenario Writer dialog, add an image picker so the scenario can be generated based on a reference image. When the user clicks **Use as prompt**, both the scenario text and the chosen image are sent back to the composer — text into the chat box, image into the **Start** frame slot.

## Changes

### 1. `src/modules/generator-ui/components/ScenarioWriterDialog.tsx`

- Add an `ImagePlus` icon button at the bottom-left inside the **Your idea** area (matching the spot circled in red), with hidden `<input type="file" accept="image/*">`.
- New local state: `imageFile`, `imagePreviewUrl` (object URL for thumbnail), `uploadedImageUrl` (public storage URL), `isUploadingImage`.
- On file pick:
  - Show inline thumbnail with an `X` to remove.
  - Upload to existing `FRAMES_BUCKET` under `${userId}/scenario-ref-${ts}-${uuid}.<ext>` and store the public URL (so it can later be reused as a Start frame).
- Extend `generate()` to send `imageUrl` in the `scenario-write` body when present. Update the description hint when an image is attached ("Scenario will be based on this image").
- Update prop type: `onUseAsPrompt: (scenario: string, imageUrl?: string) => void`.
- `handleUseAsPrompt` passes `uploadedImageUrl` along with the scenario text.
- New props: `userId: string | null` (needed for storage path).
- Reset image state in `reset()`.

### 2. `supabase/functions/scenario-write/index.ts`

- Accept optional `imageUrl: string` in the request body (validate it's an http(s) URL, length-limited).
- When present, send a multimodal user message to the Lovable AI Gateway using Gemini's vision-capable model (keep `google/gemini-2.5-flash`, which supports images):
  ```
  { role: "user", content: [
      { type: "text", text: `Idea: ${idea}\nBase the scenario on the attached reference image (subjects, setting, mood, props).` },
      { type: "image_url", image_url: { url: imageUrl } }
  ]}
  ```
- Keep the existing text-only path when no image is provided. No other behavior changes (word caps, 45s split, retry, etc. all preserved).

### 3. `src/modules/generator-ui/pages/DashboardPage.tsx`

- Pass `userId={userId}` to `<ScenarioWriterDialog />`.
- Update `onUseAsPrompt` handler:
  ```
  onUseAsPrompt={(text, imageUrl) => {
    setPromptText(text)
    if (imageUrl) {
      setGenerationMode('image-to-video')
      setUploadTarget('Start')
      setUploadedFiles([{
        id: Date.now(),
        name: 'scenario-reference.png',
        size: 0,
        target: 'Start',
        type: 'image/png',
        status: 'ready',
        url: imageUrl,
        error: null,
      }])
    }
  }}
  ```
  This mirrors how `editAndReuseJob` seeds a ready Start frame, so the image immediately shows under the **Start** chip in the composer.

## Out of scope

- No changes to `onSendScenes` (45s split-to-3-cards) — image stays attached to the composer, not auto-applied to all three scenes.
- No UI restyling beyond the new icon/thumbnail.
- No changes to job creation, models, or backend orchestration.

## Verification

- Open Scenario Writer → upload image → write scenario → output reflects the image.
- Click **Use as prompt** → dialog closes, scenario text appears in the prompt box, image appears as the Start frame, mode switches to Image-to-Video.
- Generating without an image still works exactly as before.
