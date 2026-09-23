import { Clapperboard } from 'lucide-react'

import { PlayableVideo } from '@/modules/generator-ui/components/PlayableVideo'
import { UserImageView } from '@/modules/generator-ui/components/UserImageView'
import type { LibraryCardPreviewAsset } from '@/modules/generator-ui/lib/libraryCardPreview'

type Props = {
  preview: LibraryCardPreviewAsset | null
  videoSrc?: string
}

export function LibraryCardPreview({ preview, videoSrc }: Props) {
  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2">
      {preview?.kind === 'image' ? (
        // UserImageView, not a bare <img>: a stored `storage_path` is a
        // public-bucket URL into a PRIVATE bucket, which returns 400 in an
        // <img> until it is signed. UserImageView re-signs once on error and
        // falls back to a clean placeholder — a bare <img> would just show
        // the browser's broken-image glyph.
        <UserImageView
          src={preview.image.storage_path}
          alt="Project preview"
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : preview?.kind === 'video' && videoSrc ? (
        <PlayableVideo
          thumbnail
          className="h-full w-full bg-black object-cover"
          src={videoSrc}
          poster={preview.video.thumbnail_url ?? undefined}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            const el = event.currentTarget
            try {
              if (el.currentTime === 0) {
                const dur = Number.isFinite(el.duration) ? el.duration : 0
                el.currentTime = dur > 0 ? Math.min(4, Math.max(0, dur - 0.05)) : 0.05
              }
            } catch { /* ignore */ }
          }}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-muted-foreground">
          <Clapperboard className="h-6 w-6" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
