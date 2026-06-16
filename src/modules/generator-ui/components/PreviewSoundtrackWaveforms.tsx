import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Music, Mic } from 'lucide-react'

export type PreviewSoundtrackHandle = {
  /** Start audio in sync with the video. */
  play: () => void
  /** Pause audio in sync with the video. */
  pause: () => void
  /**
   * Mirror a video seek. Pass the video's current time (seconds, film-wide).
   * Forces audio position + play/pause state immediately.
   */
  handleSeek: (videoCurrentTime: number) => void
  /**
   * Continuous, gentle re-sync used during playback (driven by the video's
   * `timeupdate`). Only corrects when drift exceeds a small threshold so the
   * audio doesn't stutter while it's already in sync.
   */
  syncTime: (videoCurrentTime: number) => void
}

type Props = {
  musicUrl?: string | null
  /** Source-trim window for the music [start, end] in seconds. */
  musicRange?: [number, number]
  musicVolume?: number
  /** Seconds into the film where the music begins (placement offset). */
  musicStartInVideo?: number
  /**
   * When true, the music plays once across its range and is silent after the
   * range length elapses (matches placement bar timing). When false, it loops.
   */
  musicLoop?: boolean
  voiceoverUrl?: string | null
  voiceoverVolume?: number
  /** Seconds into the film where the voiceover begins (placement offset). */
  voiceoverStartInVideo?: number
  /** Source-trim window for the voiceover [start, end] in seconds (end<=start = full). */
  voiceoverRange?: [number, number]
  /** Waveform height in px (compact under the preview). */
  height?: number
}

const DRIFT = 0.25

/**
 * Display-only music / voiceover waveforms shown under the video preview.
 *
 * These waveforms NEVER play on their own — `interact` is disabled and there
 * are no transport controls. Playback is driven entirely by the parent video
 * through the imperative handle, so the audio stays locked to the picture.
 *
 * Each track honours a `startInVideo` placement offset: it stays silent until
 * the film playhead reaches that point, then plays from its trimmed offset.
 */
export const PreviewSoundtrackWaveforms = forwardRef<
  PreviewSoundtrackHandle,
  Props
>(function PreviewSoundtrackWaveforms(
  {
    musicUrl,
    musicRange,
    musicVolume = 1,
    musicStartInVideo = 0,
    voiceoverUrl,
    voiceoverVolume = 1,
    voiceoverStartInVideo = 0,
    voiceoverRange,
    height = 40,
  },
  ref,
) {
  const musicContainerRef = useRef<HTMLDivElement | null>(null)
  const voiceContainerRef = useRef<HTMLDivElement | null>(null)
  const musicWsRef = useRef<WaveSurfer | null>(null)
  const voiceWsRef = useRef<WaveSurfer | null>(null)
  const musicReadyRef = useRef(false)
  const voiceReadyRef = useRef(false)
  const wantPlayingRef = useRef(false)
  const lastTimeRef = useRef(0)

  // Keep latest placement/range in refs so the gating logic always reads fresh
  // values without re-creating WaveSurfer.
  const rangeRef = useRef<[number, number] | undefined>(musicRange)
  rangeRef.current = musicRange
  const musicStartRef = useRef(musicStartInVideo)
  musicStartRef.current = musicStartInVideo
  const voiceStartRef = useRef(voiceoverStartInVideo)
  voiceStartRef.current = voiceoverStartInVideo
  const voiceRangeRef = useRef<[number, number] | undefined>(voiceoverRange)
  voiceRangeRef.current = voiceoverRange

  // Given a film time, decide whether the music should be audible and where it
  // should be positioned within the source.
  function musicGate(t: number): { active: boolean; target: number } {
    const start = Math.max(0, musicStartRef.current ?? 0)
    const range = rangeRef.current
    const winStart = range && range[1] > range[0] ? range[0] : 0
    if (t < start - 0.02) return { active: false, target: winStart }
    const local = t - start
    if (range && range[1] > range[0]) {
      const [s, e] = range
      const win = e - s
      return { active: true, target: s + (local % win) }
    }
    const dur = musicWsRef.current?.getDuration() ?? 0
    return { active: true, target: dur > 0 ? local % dur : local }
  }

  function voiceGate(t: number): { active: boolean; target: number } {
    const start = Math.max(0, voiceStartRef.current ?? 0)
    const range = voiceRangeRef.current
    const ts = range && range[1] > range[0] ? range[0] : 0
    if (t < start - 0.02) return { active: false, target: ts }
    const local = t - start
    const v = voiceWsRef.current
    const dur = v?.getDuration() ?? 0
    const te = range && range[1] > range[0] ? range[1] : dur > 0 ? dur - 0.05 : 0
    const target = ts + local
    if (te > 0 && target >= te) return { active: false, target: te }
    return { active: true, target }
  }

  // Central per-track positioning + play/pause gate. `force` rewrites position
  // unconditionally (used on seek); otherwise only meaningful drift corrects.
  function tick(t: number, force: boolean) {
    lastTimeRef.current = t

    const m = musicWsRef.current
    if (m && musicReadyRef.current) {
      const g = musicGate(t)
      if (g.active && wantPlayingRef.current) {
        if (force || Math.abs(m.getCurrentTime() - g.target) > DRIFT) {
          try { m.setTime(g.target) } catch { /* ignore */ }
        }
        if (!m.isPlaying()) m.play().catch(() => { /* ignore */ })
      } else {
        if (m.isPlaying()) { try { m.pause() } catch { /* ignore */ } }
        if (force) { try { m.setTime(g.target) } catch { /* ignore */ } }
      }
    }

    const v = voiceWsRef.current
    if (v && voiceReadyRef.current) {
      const g = voiceGate(t)
      if (g.active && wantPlayingRef.current) {
        if (force || Math.abs(v.getCurrentTime() - g.target) > DRIFT) {
          try { v.setTime(g.target) } catch { /* ignore */ }
        }
        if (!v.isPlaying()) v.play().catch(() => { /* ignore */ })
      } else {
        if (v.isPlaying()) { try { v.pause() } catch { /* ignore */ } }
        if (force) { try { v.setTime(g.target) } catch { /* ignore */ } }
      }
    }
  }

  // Build the music waveform when its URL changes.
  useEffect(() => {
    if (!musicContainerRef.current || !musicUrl) return
    musicReadyRef.current = false
    const ws = WaveSurfer.create({
      container: musicContainerRef.current,
      url: musicUrl,
      height,
      waveColor: 'rgba(16, 185, 129, 0.45)',
      progressColor: 'rgba(16, 185, 129, 0.95)',
      cursorColor: 'rgba(255, 255, 255, 0.85)',
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: false,
    })
    musicWsRef.current = ws

    const onReady = () => {
      musicReadyRef.current = true
      ws.setVolume(Math.max(0, Math.min(1, musicVolume)))
      tick(lastTimeRef.current, true)
    }
    // Loop the music inside the selected window.
    const onAudioProcess = () => {
      const range = rangeRef.current
      if (!range) return
      const [start, end] = range
      if (end > start && ws.getCurrentTime() >= end) {
        try { ws.setTime(start) } catch { /* ignore */ }
      }
    }
    ws.on('ready', onReady)
    ws.on('audioprocess', onAudioProcess)

    return () => {
      musicReadyRef.current = false
      try { ws.destroy() } catch { /* ignore */ }
      if (musicWsRef.current === ws) musicWsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicUrl, height])

  // Build the voiceover waveform when its URL changes.
  useEffect(() => {
    if (!voiceContainerRef.current || !voiceoverUrl) return
    voiceReadyRef.current = false
    const ws = WaveSurfer.create({
      container: voiceContainerRef.current,
      url: voiceoverUrl,
      height,
      waveColor: 'rgba(129, 140, 248, 0.45)',
      progressColor: 'rgba(129, 140, 248, 0.95)',
      cursorColor: 'rgba(255, 255, 255, 0.85)',
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: false,
    })
    voiceWsRef.current = ws

    const onReady = () => {
      voiceReadyRef.current = true
      ws.setVolume(Math.max(0, Math.min(1, voiceoverVolume)))
      tick(lastTimeRef.current, true)
    }
    ws.on('ready', onReady)

    return () => {
      voiceReadyRef.current = false
      try { ws.destroy() } catch { /* ignore */ }
      if (voiceWsRef.current === ws) voiceWsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceoverUrl, height])

  // Live volume updates.
  useEffect(() => {
    const ws = musicWsRef.current
    if (ws && musicReadyRef.current) ws.setVolume(Math.max(0, Math.min(1, musicVolume)))
  }, [musicVolume])
  useEffect(() => {
    const ws = voiceWsRef.current
    if (ws && voiceReadyRef.current) ws.setVolume(Math.max(0, Math.min(1, voiceoverVolume)))
  }, [voiceoverVolume])

  // Re-evaluate the gate when placement / trim changes while paused or playing.
  useEffect(() => {
    tick(lastTimeRef.current, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicStartInVideo, voiceoverStartInVideo, musicRange?.[0], musicRange?.[1], voiceoverRange?.[0], voiceoverRange?.[1]])

  useImperativeHandle(ref, () => ({
    play: () => {
      wantPlayingRef.current = true
      tick(lastTimeRef.current, false)
    },
    pause: () => {
      wantPlayingRef.current = false
      try { musicWsRef.current?.pause() } catch { /* ignore */ }
      try { voiceWsRef.current?.pause() } catch { /* ignore */ }
    },
    handleSeek: (videoCurrentTime: number) => {
      tick(Math.max(0, videoCurrentTime), true)
    },
    syncTime: (videoCurrentTime: number) => {
      tick(Math.max(0, videoCurrentTime), false)
    },
  }))

  if (!musicUrl && !voiceoverUrl) return null

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 px-4 py-3">
      {musicUrl ? (
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
            title="Music"
          >
            <Music className="h-3 w-3" aria-hidden="true" />
          </span>
          <div ref={musicContainerRef} className="min-w-0 flex-1 overflow-hidden" />
        </div>
      ) : null}
      {voiceoverUrl ? (
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-indigo-300/30 bg-indigo-400/10 text-indigo-200"
            title="Voiceover"
          >
            <Mic className="h-3 w-3" aria-hidden="true" />
          </span>
          <div ref={voiceContainerRef} className="min-w-0 flex-1 overflow-hidden" />
        </div>
      ) : null}
    </div>
  )
})

export default PreviewSoundtrackWaveforms