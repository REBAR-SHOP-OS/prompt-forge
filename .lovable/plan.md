# Auto-apply music + voiceover to the single-video preview

## Problem
When a single video card is opened in the center preview, the soundtrack (music) and AI voiceover the user has attached are NOT played alongside the video. Only the Final Film/sequence preview (`SequentialClipPlayer`) currently mixes them. The user expects: hit Play on the preview → video + music + voiceover play together automatically.

## Fix (frontend only)

### 1) New component — `src/modules/generator-ui/components/VideoWithSoundtrack.tsx`
A drop-in replacement for the bare `<video>` used in the single-clip preview. It renders the `<video>` plus hidden `<audio>` elements for music and voiceover, and synchronizes them with the video element's playback state.

Props:
- `src: string`
- `videoKey?: string` (used as `key` to force reload on src change)
- `clipVolume: number` (video element's own volume; 0 mutes clip audio)
- `musicUrl?: string | null`
- `musicRange?: [number, number]` (start/end seconds of music window; loops within window)
- `musicVolume?: number`
- `voiceoverUrl?: string | null`
- `voiceoverVolume?: number`
- standard `<video>` styling props (`className`, `style`)

Behavior (mirrors `SequentialClipPlayer` audio logic):
- `videoRef.current.volume = clipVolume`; `muted = clipVolume <= 0`.
- On video `play`: start music (seek to `musicRange[0]` if outside window) and voiceover.
- On video `pause`/`ended`: pause both audios.
- On video `seeked`: re-clamp music to range; reset voiceover to 0 if user scrubs back to 0.
- On music `timeupdate`: if `currentTime >= musicRange[1]`, loop back to `musicRange[0]`.
- When `voiceoverUrl` exists, voiceover plays from 0 once per video play; restarts if video restarts from 0.
- Volume changes apply live via effects on the corresponding refs.
- Cleanup pauses both audio elements on unmount or when their URL becomes null.

### 2) Use it in `DashboardPage.tsx` single-video preview
At lines ~2874–2885, replace the bare `<video>` with `<VideoWithSoundtrack>`, passing:
```tsx
<VideoWithSoundtrack
  videoKey={`${previewItem.job.id}:${src}`}
  src={src}
  className="h-full w-full bg-black object-contain"
  controls
  playsInline
  preload="metadata"
  clipVolume={
    musicUrl && musicRange[1] > musicRange[0]
      ? (soundtrackMode === 'music-only' ? 0 : clipVolume)
      : (voiceoverUrl ? voiceoverClipVolume : 1)
  }
  musicUrl={musicUrl}
  musicRange={musicRange}
  musicVolume={musicVolume}
  voiceoverUrl={voiceoverUrl}
  voiceoverVolume={voiceoverVolume}
/>
```
This reuses the same precedence already used for the sequence player so that:
- If music is set: clip audio is muted in `music-only` mode, mixed in `mix` mode.
- If only voiceover is set: clip audio uses `voiceoverClipVolume`.
- Otherwise: clip plays at full volume.

### 3) No changes to
- `SequentialClipPlayer` (already correct for Final Film preview).
- Music/voiceover state, upload, or rendering pipeline.
- Final Film export (server-side merge already includes both tracks).

## Verification
- Open a single video card with music + voiceover both attached → click ▶ on the preview → video plays with music looping in its window and voiceover playing once, exactly like Final Film preview.
- Switch `music-only` ↔ `mix` → clip audio mutes/unmutes live without restarting.
- Adjust music or voiceover volume sliders → audible change in real time.
- Pause/seek/scrub on the video → audios pause/resume correctly; music loops back to its start when reaching its end marker.
- Remove music or voiceover → preview keeps working, no orphan audio playback.

## Out of scope
- No changes to the Final Film server merge pipeline.
- No new UI controls; everything is automatic from existing state.
