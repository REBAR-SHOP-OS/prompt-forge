// Self-healing renderer for private-bucket images.
//
// Extracted from DashboardPage unchanged so every surface that displays a
// stored image path — including LibraryCardPreview — recovers the same way.
// A bare <img src={storage_path}> is NOT a safe substitute: those paths are
// stored as public-bucket URLs that return 400/"Bucket not found" when loaded
// directly (see resolveImageBucketKey), so the browser shows its broken-image
// glyph instead of the picture.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ImageIcon } from 'lucide-react'

import { signUserImageUrl } from '@/modules/generator-ui/lib/userImageUrl'

/**
 * Renders a private-bucket image with a self-healing fallback: if the <img>
 * fails to load (stale/unsigned URL), it re-signs once from the source path.
 * If it still fails (object deleted from storage), a clean placeholder is
 * shown instead of the browser's broken-image glyph + bare alt text.
 */
export function UserImageView({
  src,
  alt,
  className,
  imageKey,
  loading,
}: {
  src: string
  alt: string
  className?: string
  imageKey?: string
  loading?: 'lazy' | 'eager'
}) {
  const [resolved, setResolved] = useState(src)
  const [broken, setBroken] = useState(false)
  const retriedRef = useRef(false)

  useEffect(() => {
    setResolved(src)
    setBroken(false)
    retriedRef.current = false
  }, [src])

  const handleError = useCallback(() => {
    if (retriedRef.current) {
      setBroken(true)
      return
    }
    retriedRef.current = true
    let active = true
    signUserImageUrl(src)
      .then((signed) => {
        if (!active) return
        if (signed && signed !== resolved) setResolved(signed)
        else setBroken(true)
      })
      .catch(() => {
        if (active) setBroken(true)
      })
    return () => {
      active = false
    }
  }, [src, resolved])

  if (broken) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-surface-2 text-center ${className ?? ''}`}>
        <ImageIcon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        <span className="px-2 text-xs text-muted-foreground">Image unavailable</span>
      </div>
    )
  }

  return (
    <img
      key={imageKey ?? src}
      src={resolved}
      alt={alt}
      className={className}
      loading={loading}
      onError={handleError}
    />
  )
}
