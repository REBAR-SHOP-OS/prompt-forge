import {
  forwardRef,
  useCallback,
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
  /**
   * Continuous, gentle re-sync used during playback (driven by the video's
   * `timeupdate`). Only corrects when drift exceeds a small threshold so the
   * audio doesn't stutter while it's already in sync.
   */
  syncTime: (videoCurrentTime: number) => void
}

type Props = {
  musicUrl?: string | null
  musicRange?: [number, number]
  musicVolume?: number
  voiceoverUrl?: string | null
  voiceoverVolume?: number
  /** Waveform height in px (compact under the preview). */
  height?: number
  /** Total film duration (seconds) used to convert drag pixels into seconds. */
  filmDuration?: number
  /** Start offset (seconds) for the music track on the film timeline. */
  musicOffset?: number
  /** Start offset (seconds) for the voiceover track on the film timeline. */
  voiceOffset?: number
  /** Called while/after dragging the music waveform to a new start offset. */
  onMusicOffsetChange?: (seconds: number) => void
  /** Called while/after dragging the voiceover waveform to a new start offset. */
  onVoiceOffsetChange?: (seconds: number) => void
}

function fmtOffset(t: number): string {
  const sign = t > 0 ? '+' : ''
  const total = Math.abs(Math.round(t))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${sign}${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Display-only music / voiceover waveforms shown under the video preview.
 *
 * These waveforms NEVER play on their own — `interact` is disabled and there
 * are no transport controls. Playback is driven entirely by the parent video
 * through the imperative handle, so the audio stays locked to the picture.
 *
 * Each waveform can be dragged horizontally to set a *start offset*: the moment
 * on the film timeline at which that track begins to play. Dragging right pushes
 * the start later; dragging left pulls it earlier (clamped to 0).
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
    filmDuration = 0,
    musicOffset = 0,
    voiceOffset = 0,
    onMusicOffsetChange,
    onVoiceOffsetChange,
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

  // Keep latest range/offsets in refs so the audioprocess handler and the
  // imperative handle always read fresh values without re-creating WaveSurfer.
  const rangeRef = useRef<[number, number] | undefined>(musicRange)
  rangeRef.current = musicRange
  const musicOffsetRef = useRef(musicOffset)
  musicOffsetRef.current = musicOffset
  const voiceOffsetRef = useRef(voiceOffset)
  voiceOffsetRef.current = voiceOffset
  const filmDurationRef = useRef(filmDuration)
  filmDurationRef.current = filmDuration

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
        // Only start music if the playhead has already reached its offset.
        if (musicOffsetRef.current <= 0) {
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
      }
      const v = voiceWsRef.current
      if (v && voiceReadyRef.current && voiceOffsetRef.current <= 0) {
        v.play().catch(() => { /* ignore */ })
      }
    },
    pause: () => {
      wantPlayingRef.current = false
      try { musicWsRef.current?.pause() } catch { /* ignore */ }
      try { voiceWsRef.current?.pause() } catch { /* ignore */ }
    },
    handleSeek: (videoCurrentTime: number) => {
      const raw = Math.max(0, videoCurrentTime)
      // Voiceover: shifted by its start offset and clamped to its length.
      const v = voiceWsRef.current
      if (v && voiceReadyRef.current) {
        const eff = raw - voiceOffsetRef.current
        try {
          if (eff < 0) {
            try { v.setTime(0) } catch { /* ignore */ }
            try { v.pause() } catch { /* ignore */ }
          } else {
            const dur = v.getDuration()
            const target = dur > 0 ? Math.min(eff, Math.max(0, dur - 0.05)) : eff
            v.setTime(target)
            if (wantPlayingRef.current) v.play().catch(() => { /* ignore */ })
          }
        } catch { /* ignore */ }
      }
      // Music maps the (offset-shifted) video time into its selected window.
      const m = musicWsRef.current
      const range = rangeRef.current
      if (m && musicReadyRef.current) {
        const eff = raw - musicOffsetRef.current
        try {
          if (eff < 0) {
            const start = range && range[1] > range[0] ? range[0] : 0
            try { m.setTime(start) } catch { /* ignore */ }
            try { m.pause() } catch { /* ignore */ }
          } else {
            if (range && range[1] > range[0]) {
              const [start, end] = range
              const win = end - start
              m.setTime(start + (eff % win))
            } else {
              const dur = m.getDuration()
              m.setTime(dur > 0 ? eff % dur : eff)
            }
            if (wantPlayingRef.current) m.play().catch(() => { /* ignore */ })
          }
        } catch { /* ignore */ }
      }
    },
    syncTime: (videoCurrentTime: number) => {
      const raw = Math.max(0, videoCurrentTime)
      const DRIFT = 0.25
      // Voiceover follows the video 1:1 (shifted by offset); correct on drift.
      const v = voiceWsRef.current
      if (v && voiceReadyRef.current) {
        const eff = raw - voiceOffsetRef.current
        try {
          if (eff < 0) {
            if (!v.isPlaying || v.getCurrentTime() > 0.05) { /* keep silent */ }
            try { v.pause() } catch { /* ignore */ }
          } else {
            const dur = v.getDuration()
            const target = dur > 0 ? Math.min(eff, Math.max(0, dur - 0.05)) : eff
            if (Math.abs(v.getCurrentTime() - target) > DRIFT) v.setTime(target)
            if (wantPlayingRef.current && !v.isPlaying) v.play().catch(() => { /* ignore */ })
          }
        } catch { /* ignore */ }
      }
      // Music maps into its window (shifted by offset); correct on drift.
      const m = musicWsRef.current
      const range = rangeRef.current
      if (m && musicReadyRef.current) {
        const eff = raw - musicOffsetRef.current
        try {
          if (eff < 0) {
            try { m.pause() } catch { /* ignore */ }
          } else {
            let target: number
            if (range && range[1] > range[0]) {
              const [start, end] = range
              const win = end - start
              target = start + (eff % win)
            } else {
              const dur = m.getDuration()
              target = dur > 0 ? eff % dur : eff
            }
            if (Math.abs(m.getCurrentTime() - target) > DRIFT) m.setTime(target)
            if (wantPlayingRef.current && !m.isPlaying) m.play().catch(() => { /* ignore */ })
          }
        } catch { /* ignore */ }
      }
    },
  }))

  // ---- Drag-to-offset handling --------------------------------------------
  const makeDragHandler = useCallback(
    (
      containerRef: React.RefObject<HTMLDivElement | null>,
      currentOffset: number,
      onChange?: (seconds: number) => void,
    ) =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!onChange) return
        const el = containerRef.current
        const film = filmDurationRef.current
        if (!el || film <= 0) return
        const width = el.clientWidth
        if (width <= 0) return
        const secondsPerPixel = film / width
        const startX = e.clientX
        const startOffset = currentOffset
        e.preventDefault()
        try { el.setPointerCapture(e.pointerId) } catch { /* ignore */ }

        const onMove = (ev: PointerEvent) => {
          const dx = ev.clientX - startX
          let next = startOffset + dx * secondsPerPixel
          next = Math.max(0, Math.min(next, film))
          onChange(Number(next.toFixed(2)))
        }
        const onUp = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          try { el.releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      },
    [],
  )

  if (!musicUrl && !voiceoverUrl) return null

  const canDrag = filmDuration > 0
  const offsetToPct = (off: number) =>
    filmDuration > 0 ? Math.max(0, Math.min(100, (off / filmDuration) * 100)) : 0

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
          <div className="relative min-w-0 flex-1">
            <div
              onPointerDown={makeDragHandler(musicContainerRef, musicOffset, onMusicOffsetChange)}
              className={`min-w-0 overflow-hidden transition-transform ${canDrag && onMusicOffsetChange ? 'cursor-grab active:cursor-grabbing' : ''}`}
              style={{ transform: `translateX(${offsetToPct(musicOffset)}%)` }}
              title={canDrag ? 'Drag to set where the music starts on the video' : undefined}
            >
              <div ref={musicContainerRef} />
            </div>
            {musicOffset > 0 ? (
              <span className="pointer-events-none absolute right-0 top-0 rounded bg-emerald-500/80 px-1.5 py-0.5 text-[10px] font-medium text-emerald-50">
                {fmtOffset(musicOffset)}
              </span>
            ) : null}
          </div>
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
          <div className="relative min-w-0 flex-1">
            <div
              onPointerDown={makeDragHandler(voiceContainerRef, voiceOffset, onVoiceOffsetChange)}
              className={`min-w-0 overflow-hidden transition-transform ${canDrag && onVoiceOffsetChange ? 'cursor-grab active:cursor-grabbing' : ''}`}
              style={{ transform: `translateX(${offsetToPct(voiceOffset)}%)` }}
              title={canDrag ? 'Drag to set where the voiceover starts on the video' : undefined}
            >
              <div ref={voiceContainerRef} />
            </div>
            {voiceOffset > 0 ? (
              <span className="pointer-events-none absolute right-0 top-0 rounded bg-indigo-500/80 px-1.5 py-0.5 text-[10px] font-medium text-indigo-50">
                {fmtOffset(voiceOffset)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
})

export default PreviewSoundtrackWaveforms
