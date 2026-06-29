import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MutableRefObject,
} from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Music, Mic } from 'lucide-react'

export type PreviewSoundtrackHandle = {
  /** Start audio in sync with the video. */
  play: () => void
  /** Pause audio in sync with the video. */
  pause: () => void
  /**
   * Mirror a video seek. Pass the video's current time (seconds). When the
   * video scrubs back to the very start we restart the voiceover; music is
   * always re-clamped into its selection window.
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
  /** Source window inside the music file. */
  musicRange?: [number, number]
  musicVolume?: number
  /** Placement on the video timeline [start, end] in seconds. */
  musicTimeline?: [number, number]
  voiceoverUrl?: string | null
  voiceoverVolume?: number
  /** Source window inside the voiceover file. */
  voiceoverRange?: [number, number]
  /** Placement on the video timeline [start, end] in seconds. */
  voiceoverTimeline?: [number, number]
  /** Waveform height in px (compact under the preview). */
  height?: number
}

/**
 * Display-only music / voiceover waveforms shown under the video preview.
 *
 * These waveforms NEVER play on their own — `interact` is disabled and there
 * are no transport controls. Playback is driven entirely by the parent video
 * through the imperative handle, so the audio stays locked to the picture.
 */
export const PreviewSoundtrackWaveforms = forwardRef<
  PreviewSoundtrackHandle,
  Props
>(function PreviewSoundtrackWaveforms(
  {
    musicUrl,
    musicRange,
    musicVolume = 1,
    musicTimeline,
    voiceoverUrl,
    voiceoverVolume = 1,
    voiceoverRange,
    voiceoverTimeline,
    height = 40,
  },
  ref,
) {
  const musicContainerRef = useRef<HTMLDivElement | null>(null)
  const voiceContainerRef = useRef<HTMLDivElement | null>(null)
  const musicWsRef = useRef<WaveSurfer | null>(null)
  const voiceWsRef = useRef<WaveSurfer | null>(null)
  const musicAudioRef = useRef<HTMLAudioElement | null>(null)
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null)
  const musicReadyRef = useRef(false)
  const voiceReadyRef = useRef(false)
  const musicNativeReadyRef = useRef(false)
  const voiceNativeReadyRef = useRef(false)
  const wantPlayingRef = useRef(false)
  // Last film playhead (seconds) pushed from the player, so play() resumes at
  // the correct film position instead of resetting to 0.
  const lastFilmTimeRef = useRef(0)

  // Keep latest range/timeline/volume in refs so the handlers always read fresh
  // values without re-creating WaveSurfer.
  const rangeRef = useRef<[number, number] | undefined>(musicRange)
  rangeRef.current = musicRange
  const musicTimelineRef = useRef<[number, number] | undefined>(musicTimeline)
  musicTimelineRef.current = musicTimeline
  const voiceRangeRef = useRef<[number, number] | undefined>(voiceoverRange)
  voiceRangeRef.current = voiceoverRange
  const voiceTimelineRef = useRef<[number, number] | undefined>(voiceoverTimeline)
  voiceTimelineRef.current = voiceoverTimeline
  const musicVolumeRef = useRef<number>(musicVolume)
  musicVolumeRef.current = musicVolume
  const voiceVolumeRef = useRef<number>(voiceoverVolume)
  voiceVolumeRef.current = voiceoverVolume

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
      // WaveSurfer is display-only in the preview. Native <audio> below is the
      // actual playback engine because it handles signed/private/video-container
      // URLs more reliably than WaveSurfer's fetch/decode path.
      ws.setVolume(0)
      const start = rangeRef.current?.[0] ?? 0
      try { ws.setTime(start) } catch { /* ignore */ }
      if (wantPlayingRef.current) applyMusic(lastFilmTimeRef.current, true)
    }
    ws.on('ready', onReady)


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
      ws.setVolume(0)
      if (wantPlayingRef.current) applyVoice(lastFilmTimeRef.current, true)
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
    if (ws && musicReadyRef.current) ws.setVolume(0)
    if (musicAudioRef.current) musicAudioRef.current.volume = Math.max(0, Math.min(1, musicVolume))
  }, [musicVolume])
  useEffect(() => {
    const ws = voiceWsRef.current
    if (ws && voiceReadyRef.current) ws.setVolume(0)
    if (voiceAudioRef.current) voiceAudioRef.current.volume = Math.max(0, Math.min(1, voiceoverVolume))
  }, [voiceoverVolume])

  useEffect(() => {
    const a = musicAudioRef.current
    if (!a) return
    musicNativeReadyRef.current = false
    const markReady = () => {
      musicNativeReadyRef.current = true
      if (wantPlayingRef.current) applyMusic(lastFilmTimeRef.current, true)
    }
    const markErrored = () => {
      musicNativeReadyRef.current = false
      try { a.pause() } catch { /* ignore */ }
    }
    a.addEventListener('loadedmetadata', markReady)
    a.addEventListener('canplay', markReady)
    a.addEventListener('canplaythrough', markReady)
    a.addEventListener('error', markErrored)
    try { a.pause(); a.currentTime = 0; a.load() } catch { /* ignore */ }
    return () => {
      a.removeEventListener('loadedmetadata', markReady)
      a.removeEventListener('canplay', markReady)
      a.removeEventListener('canplaythrough', markReady)
      a.removeEventListener('error', markErrored)
      musicNativeReadyRef.current = false
      try { a.pause() } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicUrl])

  useEffect(() => {
    const a = voiceAudioRef.current
    if (!a) return
    voiceNativeReadyRef.current = false
    const markReady = () => {
      voiceNativeReadyRef.current = true
      if (wantPlayingRef.current) applyVoice(lastFilmTimeRef.current, true)
    }
    const markErrored = () => {
      voiceNativeReadyRef.current = false
      try { a.pause() } catch { /* ignore */ }
    }
    a.addEventListener('loadedmetadata', markReady)
    a.addEventListener('canplay', markReady)
    a.addEventListener('canplaythrough', markReady)
    a.addEventListener('error', markErrored)
    try { a.pause(); a.currentTime = 0; a.load() } catch { /* ignore */ }
    return () => {
      a.removeEventListener('loadedmetadata', markReady)
      a.removeEventListener('canplay', markReady)
      a.removeEventListener('canplaythrough', markReady)
      a.removeEventListener('error', markErrored)
      voiceNativeReadyRef.current = false
      try { a.pause() } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceoverUrl])

  const setNativeTime = (audio: HTMLAudioElement | null, t: number, forceSeek: boolean) => {
    if (!audio || !Number.isFinite(t)) return
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number.POSITIVE_INFINITY
    const target = Math.max(0, Math.min(t, Number.isFinite(dur) ? Math.max(0, dur - 0.05) : t))
    if (forceSeek || Math.abs((audio.currentTime || 0) - target) > 0.25) {
      try { audio.currentTime = target } catch { /* ignore */ }
    }
  }

  const playNative = (audio: HTMLAudioElement | null, readyRef: MutableRefObject<boolean>) => {
    if (!audio || !wantPlayingRef.current || !audio.paused) return
    if (!readyRef.current && audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      try { audio.load() } catch { /* ignore */ }
      return
    }
    const attempt = audio.play()
    if (attempt && typeof attempt.catch === 'function') {
      attempt.catch(() => {
        // If the media element was not ready yet, keep the user's desired play
        // state and retry once native readiness events arrive. Autoplay blocks
        // still resolve naturally on the next user-initiated video play.
        if (audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
          readyRef.current = false
          try { audio.load() } catch { /* ignore */ }
        }
      })
    }
  }

  // Apply music gating + source mapping for a given video playhead.
  const applyMusic = (t: number, forceSeek: boolean) => {
    const m = musicWsRef.current
    const a = musicAudioRef.current
    const tl = musicTimelineRef.current
    const tlStart = tl?.[0] ?? 0
    const tlEnd = tl && tl[1] > tl[0] ? tl[1] : Number.POSITIVE_INFINITY
    const inWin = t >= tlStart && t < tlEnd
    try {
      if (!inWin) {
        if (a) { a.volume = 0; a.pause() }
        if (m?.isPlaying()) m.pause()
        return
      }
      if (a) a.volume = Math.max(0, Math.min(1, musicVolumeRef.current))
      const range = rangeRef.current
      const rel = t - tlStart
      let target: number
      if (range && range[1] > range[0]) {
        const [start, end] = range
        const win = end - start
        target = start + (rel % win)
      } else {
        const dur = m && musicReadyRef.current ? m.getDuration() : (a?.duration ?? 0)
        target = dur > 0 ? rel % dur : rel
      }
      setNativeTime(a, target, forceSeek)
      if (m && musicReadyRef.current && (forceSeek || Math.abs(m.getCurrentTime() - target) > 0.25)) m.setTime(target)
      playNative(a, musicNativeReadyRef)
    } catch { /* ignore */ }
  }

  // Apply voiceover gating + source mapping for a given video playhead.
  const applyVoice = (t: number, forceSeek: boolean) => {
    const v = voiceWsRef.current
    const a = voiceAudioRef.current
    const tl = voiceTimelineRef.current
    const tlStart = tl?.[0] ?? 0
    const tlEnd = tl && tl[1] > tl[0] ? tl[1] : Number.POSITIVE_INFINITY
    const inWin = t >= tlStart && t < tlEnd
    try {
      if (!inWin) {
        if (a) { a.volume = 0; a.pause() }
        if (v?.isPlaying()) v.pause()
        return
      }
      const range = voiceRangeRef.current
      const dur = v && voiceReadyRef.current ? v.getDuration() : (a?.duration ?? 0)
      const srcStart = range && range[1] > range[0] ? range[0] : 0
      const srcEnd = range && range[1] > range[0] ? range[1] : (dur > 0 ? dur : Number.POSITIVE_INFINITY)
      const target = srcStart + (t - tlStart)
      if (target >= srcEnd) {
        if (a) { a.volume = 0; a.pause() }
        if (v?.isPlaying()) v.pause()
        return
      }
      if (a) a.volume = Math.max(0, Math.min(1, voiceVolumeRef.current))
      setNativeTime(a, target, forceSeek)
      if (v && voiceReadyRef.current && (forceSeek || Math.abs(v.getCurrentTime() - target) > 0.25)) {
        v.setTime(Math.max(0, Math.min(target, dur > 0 ? dur - 0.05 : target)))
      }
      playNative(a, voiceNativeReadyRef)
    } catch { /* ignore */ }
  }

  useImperativeHandle(ref, () => ({
    play: () => {
      wantPlayingRef.current = true
      const t = lastFilmTimeRef.current
      applyMusic(t, true)
      applyVoice(t, true)
    },
    pause: () => {
      wantPlayingRef.current = false
      try { musicWsRef.current?.pause() } catch { /* ignore */ }
      try { voiceWsRef.current?.pause() } catch { /* ignore */ }
      try { musicAudioRef.current?.pause() } catch { /* ignore */ }
      try { voiceAudioRef.current?.pause() } catch { /* ignore */ }
    },
    handleSeek: (videoCurrentTime: number) => {
      const t = Math.max(0, videoCurrentTime)
      lastFilmTimeRef.current = t
      applyVoice(t, true)
      applyMusic(t, true)
    },
    syncTime: (videoCurrentTime: number) => {
      const t = Math.max(0, videoCurrentTime)
      lastFilmTimeRef.current = t
      applyVoice(t, false)
      applyMusic(t, false)
    },
  }))

  if (!musicUrl && !voiceoverUrl) return null

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 px-4 py-3">
      {musicUrl ? <audio ref={musicAudioRef} src={musicUrl} preload="auto" className="hidden" /> : null}
      {voiceoverUrl ? <audio ref={voiceAudioRef} src={voiceoverUrl} preload="auto" className="hidden" /> : null}
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
