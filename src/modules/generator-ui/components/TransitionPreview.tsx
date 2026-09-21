import { useEffect, useRef, type CSSProperties } from 'react'
import type { TransitionId } from '@/modules/generator-ui/lib/mergeVideos'

type Props = {
  id: TransitionId
  size?: number
  loop?: boolean
}

const A = 'hsl(212 90% 55%)'
const B = 'hsl(28 95% 58%)'

function stylesAt(id: TransitionId, t: number): [CSSProperties, CSSProperties] {
  let aStyle: CSSProperties = { background: A, opacity: 1, transform: '', clipPath: '' }
  let bStyle: CSSProperties = { background: B, opacity: 0, transform: '', clipPath: '' }

  switch (id) {
    case 'cut': {
      const showB = t >= 0.5
      aStyle.opacity = showB ? 0 : 1
      bStyle.opacity = showB ? 1 : 0
      break
    }
    case 'fade': {
      const half = t < 0.5 ? t / 0.5 : 1
      const second = t >= 0.5 ? (t - 0.5) / 0.5 : 0
      aStyle.opacity = 1 - half
      bStyle.opacity = second
      break
    }
    case 'crossfade':
      aStyle.opacity = 1 - t
      bStyle.opacity = t
      break
    case 'slide-left':
      aStyle.transform = `translateX(${-t * 100}%)`
      bStyle = { ...bStyle, transform: `translateX(${(1 - t) * 100}%)`, opacity: 1 }
      break
    case 'slide-right':
      aStyle.transform = `translateX(${t * 100}%)`
      bStyle = { ...bStyle, transform: `translateX(${-(1 - t) * 100}%)`, opacity: 1 }
      break
    case 'wipe':
      aStyle.clipPath = `inset(0 ${t * 100}% 0 0)`
      bStyle = { ...bStyle, clipPath: `inset(0 0 0 ${(1 - t) * 100}%)`, opacity: 1 }
      break
    case 'zoom':
      aStyle = { ...aStyle, transform: `scale(${1 + t * 0.6})`, opacity: 1 - t }
      bStyle = { ...bStyle, transform: `scale(${0.4 + t * 0.6})`, opacity: t }
      break
  }

  return [aStyle, bStyle]
}

/**
 * Small animated visual preview of a video transition.
 * Animation writes directly to the two layers so each frame does not re-render
 * React. It pauses while offscreen or while the document is hidden, and uses a
 * static midpoint when the user requests reduced motion.
 */
export function TransitionPreview({ id, size = 32, loop = true }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const aRef = useRef<HTMLDivElement | null>(null)
  const bRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const DURATION = 1600
    const ANIM = 1000
    const HOLD = (DURATION - ANIM) / 2
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf: number | null = null
    let start: number | null = null
    let intersecting = true
    let documentVisible = document.visibilityState !== 'hidden'

    const applyProgress = (progress: number) => {
      const [aStyle, bStyle] = stylesAt(id, progress)
      if (aRef.current) Object.assign(aRef.current.style, aStyle)
      if (bRef.current) Object.assign(bRef.current.style, bStyle)
    }

    const stop = () => {
      if (raf != null) cancelAnimationFrame(raf)
      raf = null
      start = null
    }

    const tick = (now: number) => {
      if (start == null) start = now
      const elapsed = (now - start) % DURATION
      let progress = 0
      if (elapsed < HOLD) progress = 0
      else if (elapsed > HOLD + ANIM) progress = 1
      else progress = (elapsed - HOLD) / ANIM
      applyProgress(progress)
      raf = requestAnimationFrame(tick)
    }

    const syncAnimation = () => {
      stop()
      if (media.matches) {
        applyProgress(0.5)
      } else if (loop && intersecting && documentVisible) {
        raf = requestAnimationFrame(tick)
      } else if (!loop) {
        applyProgress(0)
      }
    }

    const onVisibilityChange = () => {
      documentVisible = document.visibilityState !== 'hidden'
      syncAnimation()
    }
    const onMotionChange = () => syncAnimation()
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          intersecting = entry?.isIntersecting ?? false
          syncAnimation()
        })

    if (rootRef.current) observer?.observe(rootRef.current)
    document.addEventListener('visibilitychange', onVisibilityChange)
    media.addEventListener('change', onMotionChange)
    syncAnimation()

    return () => {
      stop()
      observer?.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      media.removeEventListener('change', onMotionChange)
    }
  }, [loop, id])

  const w = size
  const h = Math.max(14, Math.round(size * 0.62))
  const layer: CSSProperties = { position: 'absolute', inset: 0 }
  const [initialAStyle, initialBStyle] = stylesAt(id, 0)

  return (
    <div
      ref={rootRef}
      className="relative shrink-0 overflow-hidden rounded-[3px] border border-border"
      style={{ width: w, height: h, background: '#000' }}
      aria-hidden="true"
    >
      <div ref={aRef} data-testid="transition-layer-a" style={{ ...layer, ...initialAStyle }}>
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold text-white/85">A</span>
      </div>
      <div ref={bRef} data-testid="transition-layer-b" style={{ ...layer, ...initialBStyle }}>
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold text-white/85">B</span>
      </div>
    </div>
  )
}
