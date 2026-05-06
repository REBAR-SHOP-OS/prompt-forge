// <img> wrapper that resolves a stored Supabase URL or storage path through
// `useSignedUrl` before rendering. Lets us drop-in replace existing <img>
// tags whose src came from a private bucket (user-images, overlay-assets,
// merged-videos) without restructuring parent components.

import { forwardRef, type ImgHTMLAttributes } from 'react'
import { useSignedUrl } from '@/modules/generator-ui/lib/signedStorageUrl'

interface SignedImgProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | null | undefined
}

export const SignedImg = forwardRef<HTMLImageElement, SignedImgProps>(
  function SignedImg({ src, ...rest }, ref) {
    const resolved = useSignedUrl(src)
    return <img ref={ref} src={resolved} {...rest} />
  },
)
