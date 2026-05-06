import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, {
  type Region,
} from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { Pause, Play } from 'lucide-react'

export type SoundtrackWaveformHandle = {
  play: () => void
  pause: () => void
  seekTo: (seconds: number) => void
  playRange: (start: number, end: number) => void
}

type Props = {
  url: string
  range: [number, number]
  onReady?: (duration: number) => void
  onRangeChange?: (range: [number, number]) => void
  height?: number
}

function fmt(t: number) {
  if (!Number.isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const SoundtrackWaveform = forwardRef<SoundtrackWaveformHandle, Props>(
  function SoundtrackWaveform(
    { url, range, onReady, onRangeChange, height = 96 },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const wsRef = useRef<WaveSurfer | null>(null)
    const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(
      null,
    )
    const regionRef = useRef<Region | null>(null)
    const stopAtRef = useRef<number | null>(null)

    const [isReady, setIsReady] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)

    // Init WaveSurfer when url changes
    useEffect(() => {
      if (!containerRef.current || !url) return
      setIsReady(false)
      setIsPlaying(false)
      setCurrentTime(0)

      const regions = RegionsPlugin.create()
      regionsRef.current = regions

      const ws = WaveSurfer.create({
        container: containerRef.current,
        url,
        height,
        waveColor: 'rgba(228, 228, 231, 0.45)', // zinc-200/45
        progressColor: 'rgba(255, 255, 255, 0.95)',
        cursorColor: 'rgba(16, 185, 129, 0.95)', // emerald-500
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
        interact: true,
        plugins: [regions],
      })
      wsRef.current = ws

      const handleReady = () => {
        const d = ws.getDuration()
        setDuration(d)
        setIsReady(true)
        onReady?.(d)

        // Create selection region
        const start = Math.max(0, Math.min(range[0] ?? 0, d))
        const end = Math.max(start + 0.1, Math.min(range[1] ?? d, d))
        const r = regions.addRegion({
          start,
          end,
          color: 'rgba(16, 185, 129, 0.18)',
          drag: true,
          resize: true,
          id: 'soundtrack-selection',
        })
        regionRef.current = r
      }

      const handleAudioProcess = () => {
        const t = ws.getCurrentTime()
        setCurrentTime(t)
        if (stopAtRef.current != null && t >= stopAtRef.current) {
          ws.pause()
          stopAtRef.current = null
        }
      }
      const handleSeek = () => setCurrentTime(ws.getCurrentTime())
      const handlePlay = () => setIsPlaying(true)
      const handlePause = () => setIsPlaying(false)
      const handleFinish = () => {
        setIsPlaying(false)
        stopAtRef.current = null
      }

      ws.on('ready', handleReady)
      ws.on('audioprocess', handleAudioProcess)
      ws.on('seeking', handleSeek)
      ws.on('interaction', handleSeek)
      ws.on('play', handlePlay)
      ws.on('pause', handlePause)
      ws.on('finish', handleFinish)

      regions.on('region-updated', (r: Region) => {
        if (r.id !== 'soundtrack-selection') return
        onRangeChange?.([r.start, r.end])
      })

      return () => {
        stopAtRef.current = null
        ws.destroy()
        wsRef.current = null
        regionsRef.current = null
        regionRef.current = null
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, height])

    // Sync external range changes into the region
    useEffect(() => {
      const r = regionRef.current
      if (!r || !isReady) return
      if (Math.abs(r.start - range[0]) < 0.05 && Math.abs(r.end - range[1]) < 0.05)
        return
      r.setOptions({ start: range[0], end: range[1] })
    }, [range, isReady])

    useImperativeHandle(ref, () => ({
      play: () => wsRef.current?.play(),
      pause: () => wsRef.current?.pause(),
      seekTo: (seconds: number) => {
        const ws = wsRef.current
        if (!ws) return
        const d = ws.getDuration() || 1
        ws.seekTo(Math.max(0, Math.min(seconds / d, 1)))
      },
      playRange: (start: number, end: number) => {
        const ws = wsRef.current
        if (!ws) return
        const d = ws.getDuration() || 1
        stopAtRef.current = end
        ws.seekTo(Math.max(0, Math.min(start / d, 1)))
        void ws.play()
      },
    }))

    const togglePlay = () => {
      const ws = wsRef.current
      if (!ws) return
      if (ws.isPlaying()) {
        ws.pause()
      } else {
        stopAtRef.current = null
        void ws.play()
      }
    }

    const playSelection = () => {
      const ws = wsRef.current
      const r = regionRef.current
      if (!ws || !r) return
      stopAtRef.current = r.end
      const d = ws.getDuration() || 1
      ws.seekTo(Math.max(0, Math.min(r.start / d, 1)))
      void ws.play()
    }

    return (
      <div className="space-y-2">
        <div
          ref={containerRef}
          className="w-full overflow-hidden rounded-md border border-white/10 bg-black/40 px-2 py-2"
          style={{ minHeight: height + 16 }}
        />
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!isReady}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-white/10 text-zinc-50 shadow-sm transition hover:border-white/40 hover:bg-white/20 disabled:opacity-40"
              aria-label={isPlaying ? 'Pause' : 'Play full track'}
              title={isPlaying ? 'Pause' : 'Play full track'}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={playSelection}
              disabled={!isReady}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 text-[11px] font-medium uppercase tracking-wider text-emerald-100 transition hover:border-emerald-300/60 hover:bg-emerald-500/25 disabled:opacity-40"
              aria-label="Play selected section"
              title="Play only the green selection"
            >
              <Play className="h-3 w-3" />
              <span>Play selection</span>
            </button>
          </div>
          <span className="tabular-nums text-zinc-200">
            {fmt(currentTime)} / {fmt(duration)}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-400">
          Drag the edges of the green box to choose the section. That section will play
          across the entire Final Film.
        </p>
      </div>
    )
  },
)
