## Goal

Music **and** AI Voiceover should coexist as two independent chips in the top tabs area. When the user clicks **Final Film**, the renderer mixes the soundtrack music + the voiceover + (optionally) clip audio together onto the merged video. Today, generating a voiceover overwrites `musicUrl`, so only one of the two ever survives.

## Frontend changes — `src/modules/generator-ui/pages/DashboardPage.tsx`

1. **Add independent voiceover state** alongside the existing music state:
   - `voiceoverUrl: string | null`
   - `voiceoverName: string | null`
   - `voiceoverVolume: number` (default `1`)
   Persist `voiceoverVolume` in the same workspace settings localStorage key already used for music settings; the URL itself stays in-memory (object URL) like music does.

2. **Stop overwriting music in `handleVoiceoverAsSoundtrack(url, name)`** (≈ line 1928). New behaviour:
   - Revoke any previous `voiceoverUrl` blob URL.
   - Set `voiceoverUrl = url`, `voiceoverName = name`. Do NOT touch `musicUrl` / `musicRange` / `soundtrackMode`.
   - Close the voiceover dialog (no auto Final Film — same rule as music).

3. **Add a second chip** next to the existing music chip in the top tabs row (the same row that today shows `Voiceover (female, excited) ✕`). Render only when `voiceoverUrl` is set. Style it identically to the music chip (use the same component / classes), with:
   - Mic icon + truncated `voiceoverName`
   - `✕` button calling new `handleClearVoiceover()` which revokes the blob URL and clears voiceover state.
   The music chip already exists and keeps its current behaviour.

4. **Build a combined `audioOpt` in `handleMergeAllVideos`** (≈ line 2020). Pass both tracks to the merger:
   ```ts
   const audioOpt = (musicUrl && musicRange[1] > musicRange[0]) || voiceoverUrl
     ? {
         music: musicUrl && musicRange[1] > musicRange[0]
           ? { src: musicUrl, startSec: musicRange[0], endSec: musicRange[1], musicVolume }
           : undefined,
         voiceover: voiceoverUrl
           ? { src: voiceoverUrl, volume: voiceoverVolume }
           : undefined,
         clipVolume: soundtrackMode === 'music-only' ? 0 : clipVolume,
       }
     : undefined
   ```

5. **Reset voiceover** in `handleStartOver` and after a successful merge cleanup path (mirroring how `musicUrl` is currently torn down at line 2147 — keep voiceover too, or keep both; simplest: clear voiceover at Start Over only, leave it attached after merge so the user can re-render).

## Library change — `src/modules/generator-ui/lib/mergeVideos.ts`

Extend `MergeAudioOptions` to a richer shape:

```ts
export interface MergeAudioOptions {
  music?: { src: string; startSec: number; endSec: number; musicVolume?: number }
  voiceover?: { src: string; volume?: number }
  /** 0..1, default 0 when music or voiceover is present, else 1 */
  clipVolume?: number
}
```

Inside `mergeVideoUrls` (lines 219–303):
- `useSoundtrack = Boolean(audio?.music?.endSec > audio?.music?.startSec || audio?.voiceover)`.
- Keep the existing music `<audio>` + gain pipeline, gated on `audio.music`.
- Add a parallel pipeline for voiceover: create a second hidden `<audio>` element with `audio.voiceover.src`, `loop = false`, `currentTime = 0`, hook through `audioCtx.createMediaElementSource` → gain (`audio.voiceover.volume ?? 1`) → `audioDest`. Start it at the same moment the merge starts playing the first clip; let it end naturally — no clamping/looping needed.
- Tear it down in the same cleanup block as the existing soundtrack element (line 540 area): pause, detach, allow GC.

Backwards-compat shim for any older caller still passing the flat `{ src, startSec, endSec, musicVolume, clipVolume }` shape: detect `audio.src` and translate to `{ music: { src, startSec, endSec, musicVolume }, clipVolume }` before running. (Keeps the contract one-way safe.)

## Out of scope

- No backend / edge function / RLS / DB changes.
- No change to the existing "Done" button behaviour added in the previous turn — Final Film is still triggered only by the explicit Forge / Final Film button.
- No new dialog: the AI Voiceover dialog already returns `(url, name)`; we just route it to its own slot instead of the music slot.

## Verification

- Generate a voiceover → confirm → chip appears next to the music chip; the music chip (if present) is untouched.
- Upload music → adjust range → Done → both chips visible simultaneously.
- Click Final Film → rendered MP4 contains music (within the chosen range, looping handled as today) **and** the voiceover playing once from t=0, mixed together. If `soundtrackMode === 'mix'`, clip audio is also audible underneath.
- Click ✕ on the voiceover chip → only voiceover is removed; subsequent Final Film has music only.
- Click ✕ on the music chip → only music is removed; Final Film has voiceover only.
- Start Over → both chips clear.