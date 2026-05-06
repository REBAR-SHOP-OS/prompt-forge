import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { TransitionId } from '@/modules/generator-ui/lib/mergeVideos'

type Props = {
  id: TransitionId
  size?: number
  loop?: boolean
}

/**
 * Small animated visual preview of a video transition.
 * Two colored "A" / "B" panels animate using the same visual idea
 * as the merge engine (cut, fade, crossfade, slides, wipe, zoom).
 */
export function TransitionPreview({ id, size = 32, loop = true }: Props) {
  const [t, setT] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!loop) return
    const DURATION = 1600
    const ANIM = 1000
    const HOLD = (DURATION - ANIM) / 2

    const tick = (now: number) => {
      if (startRef.current == null) startRef.current = now
      const elapsed = (now - startRef.current) % DURATION
      let progress = 0
      if (elapsed < HOLD) progress = 0
      else if (elapsed > HOLD + ANIM) progress = 1
      else progress = (elapsed - HOLD) / ANIM
      setT(progress)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      startRef.current = null
    }
  }, [loop, id])

  const A = 'hsl(212 90% 55%)'
  const B = 'hsl(28 95% 58%)'

  const w = size
  const h = Math.max(14, Math.round(size * 0.62))

  let aStyle: CSSProperties = { background: A }
  let bStyle: CSSProperties = { background: B, opacity: 0 }

  switch (id) {
    case 'cut': {
      const showB = t >= 0.5
      aStyle = { background: A, opacity: showB ? 0 : 1 }
      bStyle = { background: B, opacity: showB ? 1 : 0 }
      break
    }
    case 'fade': {
      const half = t < 0.5 ? t / 0.5 : 1
      const second = t >= 0.5 ? (t - 0.5) / 0.5 : 0
      aStyle = { background: A, opacity: 1 - half }
      bStyle = { background: B, opacity: second }
      break
    }
    case 'crossfade': {
      aStyle = { background: A, opacity: 1 - t }
      bStyle = { background: B, opacity: t }
      break
    }
    case 'slide-left': {
      aStyle = { background: A, transform: `translateX(${-t * 100}%)`, opacity: 1 }
      bStyle = { background: B, transform: `translateX(${(1 - t) * 100}%)`, opacity: 1 }
      break
    }
    case 'slide-right': {
      aStyle = { background: A, transform: `translateX(${t * 100}%)`, opacity: 1 }
      bStyle = { background: B, transform: `translateX(${-(1 - t) * 100}%)`, opacity: 1 }
      break
    }
    case 'wipe': {
      aStyle = { background: A, clipPath: `inset(0 ${t * 100}% 0 0)`, opacity: 1 }
      bStyle = { background: B, clipPath: `inset(0 0 0 ${(1 - t) * 100}%)`, opacity: 1 }
      break
    }
    case 'zoom': {
      const aScale = 1 + t * 0.6
      const bScale = 0.4 + t * 0.6
      aStyle = { background: A, transform: `scale(${aScale})`, opacity: 1 - t }
      bStyle = { background: B, transform: `scale(${bScale})`, opacity: t }
      break
    }
    default: {
      aStyle = { background: A }
      bStyle = { background: B, opacity: 0 }
    }
  }

  const layer: CSSProperties = { position: 'absolute', inset: 0 }

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[3px] border border-white/15"
      style={{ width: w, height: h, background: '#000' }}
      aria-hidden="true"
    >
      <div style={{ ...layer, ...aStyle }}>
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold text-white/85">A</span>
      </div>
      <div style={{ ...layer, ...bStyle }}>
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold text-white/85">B</span>
      </div>
    </div>
  )
}
