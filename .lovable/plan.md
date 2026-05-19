## Goal

When the user clicks **Send all to Pending** in the Scenario Writer, in addition to creating the 3 pending jobs (current behavior), the composer should also be seeded — same as **Use as prompt**:

- Full concatenated scenario text → prompt/chat box
- Attached reference image → **Start** frame slot (mode switched to Image-to-Video)

## Changes

### 1. `src/modules/generator-ui/components/ScenarioWriterDialog.tsx`

- Extend prop signature:
  ```ts
  onSendScenes?: (scenes: string[], imageUrl?: string) => void | Promise<void>
  ```
- In `handleSendAll`, pass the uploaded image URL too:
  ```ts
  await onSendScenes(scenes, uploadedImageUrl ?? undefined)
  ```

### 2. `src/modules/generator-ui/pages/DashboardPage.tsx`

Wrap the existing `submitScenesAsJobs` so the composer is seeded first:

```tsx
onSendScenes={async (scenes, imageUrl) => {
  setPromptText(scenes.join('\n\n'))
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
  await submitScenesAsJobs(scenes)
}}
```

## Out of scope

- `submitScenesAsJobs` itself is not modified — the 3-card submission keeps working as today.
- No change to per-scene image attachment in the pending jobs (image only seeds the composer Start slot).
- No UI restyling.

## Verification

- 45s + image + idea → **Send all to Pending** → 3 cards appear in Pending, prompt box shows full scenario, Start frame shows the image, mode switches to Image-to-Video.
- Without an image → prompt box still receives the scenario text; Start stays empty; mode unchanged.
- **Use as prompt** behavior is unaffected.
