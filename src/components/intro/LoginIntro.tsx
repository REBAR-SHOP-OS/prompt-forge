import { useEffect, useRef, useState } from 'react'
import { SkipForward, Volume2, VolumeX } from 'lucide-react'
import introSrc from '@/assets/intro/login-intro.mp4'

type LoginIntroProps = {
  onFinish: () => void
  onDisableForever?: () => void
}

export default function LoginIntro({ onFinish, onDisableForever }: LoginIntroProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onFinish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onFinish])

  // Safety net: if the video never starts (autoplay blocked, missing/broken file,
  // slow network), don't trap the user on a black screen — auto-skip after 6s.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let started = false
    const onPlaying = () => { started = true }
    v.addEventListener('playing', onPlaying)
    const timeoutId = window.setTimeout(() => {
      if (!started) onFinish()
    }, 6000)
    return () => {
      v.removeEventListener('playing', onPlaying)
      window.clearTimeout(timeoutId)
    }
  }, [onFinish])

  function toggleMute() {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
    if (!v.muted) {
      void v.play().catch(() => { /* ignore */ })
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
      <video
        ref={videoRef}
        src={introSrc}
        autoPlay
        muted
        playsInline
        onEnded={onFinish}
        onError={onFinish}
        className="h-full w-full object-contain"
      />

      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute intro' : 'Mute intro'}
        title={muted ? 'Unmute' : 'Mute'}
        className="absolute bottom-6 left-6 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/40 text-white/80 backdrop-blur transition hover:border-white/30 hover:bg-black/60 hover:text-white"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      <button
        type="button"
        onClick={onFinish}
        aria-label="Skip intro"
        className="absolute right-6 top-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/85 backdrop-blur transition hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-100"
      >
        <span>Skip</span>
        <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
