// <video> wrapper that resolves a stored Supabase URL or storage path through
// `useSignedUrl` before rendering. Required because the `merged-videos`,
// `user-images`, and `overlay-assets` buckets are private — the legacy public
// URL strings stored in DB rows must be re-signed on demand.

import { forwardRef, type VideoHTMLAttributes } from 'react'
import { useSignedUrl } from '@/modules/generator-ui/lib/signedStorageUrl'

interface SignedVideoProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> {
  src: string | null | undefined
}

export const SignedVideo = forwardRef<HTMLVideoElement, SignedVideoProps>(
  function SignedVideo({ src, ...rest }, ref) {
    const resolved = useSignedUrl(src)
    // key on resolved so the element reloads when the URL becomes available
    return <video ref={ref} key={resolved || 'pending'} src={resolved || undefined} {...rest} />
  },
)

interface SignedAnchorProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string | null | undefined
}

export const SignedDownloadLink = forwardRef<HTMLAnchorElement, SignedAnchorProps>(
  function SignedDownloadLink({ href, children, ...rest }, ref) {
    const resolved = useSignedUrl(href)
    return (
      <a ref={ref} href={resolved || '#'} {...rest}>
        {children}
      </a>
    )
  },
)
