import { X } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function WelcomeVideoOverlay({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-sm text-foreground hover:bg-background"
        aria-label="Skip intro"
      >
        <X className="h-4 w-4" />
        Skip
      </button>
      <video
        src="/intro/welcome.mp4"
        autoPlay
        playsInline
        controls
        onEnded={onClose}
        className="h-full w-full object-cover"
      />
    </div>
  )
}
