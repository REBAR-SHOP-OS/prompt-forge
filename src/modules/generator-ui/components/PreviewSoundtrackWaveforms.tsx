import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
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
  /** Track lane height in px (compact under the preview). */
  height?: number
  /** Total film duration (seconds) used to convert drag pixels into seconds. */
  filmDuration?: number
  /** Start offset (seconds) for the music track on the film timeline. */
  musicOffset?: number
  /** Start offset (seconds) for the voiceover track on the film timeline. */
  voiceOffset?: number
  /** Called while/after dragging the music block to a new start offset. */
  onMusicOffsetChange?: (seconds: number) => void
  /** Called while/after dragging the voiceover block to a new start offset. */
  onVoiceOffsetChange?: (seconds: number) => void
  /** Optional padding so the track lanes align with the play bar's track. */
  trackAreaClassName?: string
}

function fmtTime(t: number): string {
  const total = Math.max(0, Math.round(t))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Compact, draggable soundtrack lanes shown under the video preview.
 *
 * Playback is driven entirely by the parent video through the imperative
 * handle, using hidden <audio> elements — the tracks never play on their own.
 *
 * Each track is rendered as a simple colored block on a timeline that is
 * aligned with the play bar. The block's left edge represents the second on the
 * film at which the track starts; its width is the track's length relative to
 * the whole film. Dragging the block horizontally sets that start offset.
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
    height = 28,
    filmDuration = 0,
    musicOffset = 0,
    voiceOffset = 0,
    onMusicOffsetChange,
    onVoiceOffsetChange,
    trackAreaClassName,
  },
  ref,
) {
  const musicAudioRef = useRef<HTMLAudioElement | null>(null)
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null)
  const musicReadyRef = useRef(false)
  const voiceReadyRef = useRef(false)
  const wantPlayingRef = useRef(false)

  const [musicDuration, setMusicDuration] = useState(0)
  const [voiceDuration, setVoiceDuration] = useState(0)

  // Keep latest range/offsets in refs so handlers read fresh values.
  const rangeRef = useRef<[number, number] | undefined>(musicRange)
  rangeRef.current = musicRange
  const musicOffsetRef = useRef(musicOffset)
  musicOffsetRef.current = musicOffset
  const voiceOffsetRef = useRef(voiceOffset)
  voiceOffsetRef.current = voiceOffset
  const filmDurationRef = useRef(filmDuration)
  filmDurationRef.current = filmDuration

  // Build / tear down the music audio element when its URL changes.
  useEffect(() => {
    musicReadyRef.current = false
    setMusicDuration(0)
    if (!musicUrl) {
      musicAudioRef.current = null
      return
    }
    const audio = new Audio()
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous'
    audio.src = musicUrl
    musicAudioRef.current = audio

    const onLoaded = () => {
      musicReadyRef.current = true
      audio.volume = Math.max(0, Math.min(1, musicVolume))
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setMusicDuration(audio.duration)
      }
      const start = rangeRef.current?.[0] ?? 0
      try { audio.currentTime = start } catch { /* ignore */ }
      if (wantPlayingRef.current && musicOffsetRef.current <= 0) {
        audio.play().catch(() => { /* ignore */ })
      }
    }
    // Loop music inside the selected window.
    const onTimeUpdate = () => {
      const range = rangeRef.current
      if (!range) return
      const [start, end] = range
      if (end > start && audio.currentTime >= end) {
        try { audio.currentTime = start } catch { /* ignore */ }
      }
    }
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTimeUpdate)

    return () => {
      musicReadyRef.current = false
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      try { audio.pause() } catch { /* ignore */ }
      audio.src = ''
      if (musicAudioRef.current === audio) musicAudioRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicUrl])

  // Build / tear down the voiceover audio element when its URL changes.
  useEffect(() => {
    voiceReadyRef.current = false
    setVoiceDuration(0)
    if (!voiceoverUrl) {
      voiceAudioRef.current = null
      return
    }
    const audio = new Audio()
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous'
    audio.src = voiceoverUrl
    voiceAudioRef.current = audio

    const onLoaded = () => {
      voiceReadyRef.current = true
      audio.volume = Math.max(0, Math.min(1, voiceoverVolume))
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setVoiceDuration(audio.duration)
      }
      if (wantPlayingRef.current && voiceOffsetRef.current <= 0) {
        audio.play().catch(() => { /* ignore */ })
      }
    }
    audio.addEventListener('loadedmetadata', onLoaded)

    return () => {
      voiceReadyRef.current = false
      audio.removeEventListener('loadedmetadata', onLoaded)
      try { audio.pause() } catch { /* ignore */ }
      audio.src = ''
      if (voiceAudioRef.current === audio) voiceAudioRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceoverUrl])

  // Live volume updates.
  useEffect(() => {
    const a = musicAudioRef.current
    if (a) a.volume = Math.max(0, Math.min(1, musicVolume))
  }, [musicVolume])
  useEffect(() => {
    const a = voiceAudioRef.current
    if (a) a.volume = Math.max(0, Math.min(1, voiceoverVolume))
  }, [voiceoverVolume])

  useImperativeHandle(ref, () => ({
    play: () => {
      wantPlayingRef.current = true
      const m = musicAudioRef.current
      if (m && musicReadyRef.current && musicOffsetRef.current <= 0) {
        const range = rangeRef.current
        if (range) {
          const [start, end] = range
          const t = m.currentTime
          if (end > start && (t < start || t >= end)) {
            try { m.currentTime = start } catch { /* ignore */ }
          }
        }
        m.play().catch(() => { /* ignore */ })
      }
      const v = voiceAudioRef.current
      if (v && voiceReadyRef.current && voiceOffsetRef.current <= 0) {
        v.play().catch(() => { /* ignore */ })
      }
    },
    pause: () => {
      wantPlayingRef.current = false
      try { musicAudioRef.current?.pause() } catch { /* ignore */ }
      try { voiceAudioRef.current?.pause() } catch { /* ignore */ }
    },
    handleSeek: (videoCurrentTime: number) => {
      const raw = Math.max(0, videoCurrentTime)
      // Voiceover: shifted by its start offset and clamped to its length.
      const v = voiceAudioRef.current
      if (v && voiceReadyRef.current) {
        const eff = raw - voiceOffsetRef.current
        try {
          if (eff < 0) {
            try { v.currentTime = 0 } catch { /* ignore */ }
            try { v.pause() } catch { /* ignore */ }
          } else {
            const dur = v.duration
            const target = dur > 0 ? Math.min(eff, Math.max(0, dur - 0.05)) : eff
            v.currentTime = target
            if (wantPlayingRef.current) v.play().catch(() => { /* ignore */ })
          }
        } catch { /* ignore */ }
      }
      // Music maps the (offset-shifted) video time into its selected window.
      const m = musicAudioRef.current
      const range = rangeRef.current
      if (m && musicReadyRef.current) {
        const eff = raw - musicOffsetRef.current
        try {
          if (eff < 0) {
            const start = range && range[1] > range[0] ? range[0] : 0
            try { m.currentTime = start } catch { /* ignore */ }
            try { m.pause() } catch { /* ignore */ }
          } else {
            if (range && range[1] > range[0]) {
              const [start, end] = range
              const win = end - start
              m.currentTime = start + (eff % win)
            } else {
              const dur = m.duration
              m.currentTime = dur > 0 ? eff % dur : eff
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
      const v = voiceAudioRef.current
      if (v && voiceReadyRef.current) {
        const eff = raw - voiceOffsetRef.current
        try {
          if (eff < 0) {
            try { v.pause() } catch { /* ignore */ }
          } else {
            const dur = v.duration
            const target = dur > 0 ? Math.min(eff, Math.max(0, dur - 0.05)) : eff
            if (Math.abs(v.currentTime - target) > DRIFT) v.currentTime = target
            if (wantPlayingRef.current && v.paused) v.play().catch(() => { /* ignore */ })
          }
        } catch { /* ignore */ }
      }
      // Music maps into its window (shifted by offset); correct on drift.
      const m = musicAudioRef.current
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
              const dur = m.duration
              target = dur > 0 ? eff % dur : eff
            }
            if (Math.abs(m.currentTime - target) > DRIFT) m.currentTime = target
            if (wantPlayingRef.current && m.paused) m.play().catch(() => { /* ignore */ })
          }
        } catch { /* ignore */ }
      }
    },
  }))

  // ---- Drag-to-offset handling --------------------------------------------
  const laneRef = useRef<HTMLDivElement | null>(null)
  const makeDragHandler = useCallback(
    (currentOffset: number, onChange?: (seconds: number) => void) =>
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!onChange) return
        const lane = laneRef.current
        const film = filmDurationRef.current
        if (!lane || film <= 0) return
        const width = lane.clientWidth
        if (width <= 0) return
        const secondsPerPixel = film / width
        const startX = e.clientX
        const startOffset = currentOffset
        e.preventDefault()
        e.stopPropagation()
        const target = e.currentTarget
        try { target.setPointerCapture(e.pointerId) } catch { /* ignore */ }

        const onMove = (ev: PointerEvent) => {
          const dx = ev.clientX - startX
          let next = startOffset + dx * secondsPerPixel
          next = Math.max(0, Math.min(next, film))
          onChange(Number(next.toFixed(2)))
        }
        const onUp = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          try { target.releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      },
    [],
  )

  if (!musicUrl && !voiceoverUrl) return null

  const canDrag = filmDuration > 0
  const pct = (v: number) =>
    filmDuration > 0 ? Math.max(0, Math.min(100, (v / filmDuration) * 100)) : 0
  // Minimum visible width so a block stays grabbable even for short tracks.
  const blockWidthPct = (dur: number) =>
    filmDuration > 0 ? Math.max(8, Math.min(100, (dur / filmDuration) * 100)) : 100

  const renderLane = (
    kind: 'music' | 'voice',
    duration: number,
    offset: number,
    onChange?: (s: number) => void,
  ) => {
    const isMusic = kind === 'music'
    const Icon = isMusic ? Music : Mic
    const colorBlock = isMusic
      ? 'border-emerald-300/40 bg-emerald-500/25 text-emerald-50'
      : 'border-indigo-300/40 bg-indigo-500/25 text-indigo-50'
    const left = pct(offset)
    const widthPct = blockWidthPct(duration)
    return (
      <div className="relative w-full" style={{ height }}>
        {/* lane track background */}
        <div className="absolute inset-0 rounded-md bg-white/[0.04]" />
        <div
          role="slider"
          aria-label={isMusic ? 'Music start time' : 'Voiceover start time'}
          aria-valuemin={0}
          aria-valuemax={Math.round(filmDuration)}
          aria-valuenow={Math.round(offset)}
          onPointerDown={makeDragHandler(offset, onChange)}
          className={`absolute top-0 flex h-full items-center gap-1.5 overflow-hidden rounded-md border px-2 ${colorBlock} ${
            canDrag && onChange ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          style={{ left: `${left}%`, width: `${widthPct}%`, maxWidth: `${100 - left}%` }}
          title={canDrag ? 'Drag to set where this track starts on the video' : undefined}
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate text-[10px] font-semibold tabular-nums">
            {fmtTime(offset)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-1.5 border-t border-white/10 py-2 ${trackAreaClassName ?? 'px-4'}`}>
      <div ref={laneRef} className="flex flex-col gap-1.5">
        {musicUrl ? renderLane('music', musicDuration, musicOffset, onMusicOffsetChange) : null}
        {voiceoverUrl ? renderLane('voice', voiceDuration, voiceOffset, onVoiceOffsetChange) : null}
      </div>
    </div>
  )
})

export default PreviewSoundtrackWaveforms
