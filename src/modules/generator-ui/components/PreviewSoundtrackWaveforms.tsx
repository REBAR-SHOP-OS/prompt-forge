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
   * Mirror a video seek. Pass the video's current time (seconds). When the
   * video scrubs back to the very start we restart the voiceover; music is
   * always re-clamped into its selection window.
   */
  handleSeek: (videoCurrentTime: number) => void
}

type Props = {
  musicUrl?: string | null
  musicRange?: [number, number]
  musicVolume?: number
  voiceoverUrl?: string | null
  voiceoverVolume?: number
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
    voiceoverUrl,
    voiceoverVolume = 1,
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

  // Keep latest range/volume in refs so the audioprocess handler and the
  // imperative handle always read fresh values without re-creating WaveSurfer.
  const rangeRef = useRef<[number, number] | undefined>(musicRange)
  rangeRef.current = musicRange

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
      const start = rangeRef.current?.[0] ?? 0
      try { ws.setTime(start) } catch { /* ignore */ }
      if (wantPlayingRef.current) {
        ws.play().catch(() => { /* autoplay block — ignore */ })
      }
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
      if (wantPlayingRef.current) {
        ws.play().catch(() => { /* ignore */ })
      }
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

  useImperativeHandle(ref, () => ({
    play: () => {
      wantPlayingRef.current = true
      const m = musicWsRef.current
      if (m && musicReadyRef.current) {
        const range = rangeRef.current
        if (range) {
          const [start, end] = range
          const t = m.getCurrentTime()
          if (end > start && (t < start || t >= end)) {
            try { m.setTime(start) } catch { /* ignore */ }
          }
        }
        m.play().catch(() => { /* ignore */ })
      }
      const v = voiceWsRef.current
      if (v && voiceReadyRef.current) v.play().catch(() => { /* ignore */ })
    },
    pause: () => {
      wantPlayingRef.current = false
      try { musicWsRef.current?.pause() } catch { /* ignore */ }
      try { voiceWsRef.current?.pause() } catch { /* ignore */ }
    },
    handleSeek: (videoCurrentTime: number) => {
      const t = Math.max(0, videoCurrentTime)
      // Voiceover follows the video's playhead 1:1 (clamped to its length).
      const v = voiceWsRef.current
      if (v && voiceReadyRef.current) {
        try {
          const dur = v.getDuration()
          const target = dur > 0 ? Math.min(t, Math.max(0, dur - 0.05)) : t
          v.setTime(target)
        } catch { /* ignore */ }
      }
      // Music maps the video time into its selected window and loops inside it.
      const m = musicWsRef.current
      const range = rangeRef.current
      if (m && musicReadyRef.current) {
        try {
          if (range && range[1] > range[0]) {
            const [start, end] = range
            const win = end - start
            const target = start + (t % win)
            m.setTime(target)
          } else {
            const dur = m.getDuration()
            const target = dur > 0 ? t % dur : t
            m.setTime(target)
          }
        } catch { /* ignore */ }
      }
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
