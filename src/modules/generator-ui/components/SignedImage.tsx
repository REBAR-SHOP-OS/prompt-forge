// <img> wrapper that resolves a PRIVATE-bucket storage reference into a fresh
// signed URL before rendering. Drop-in replacement for `<img src={storage_path}>`
// where the source may point at a now-private Supabase Storage bucket.
import type { ImgHTMLAttributes } from "react";
import { useSignedUrl } from "@/modules/generator-ui/lib/signedStorageUrl";

type SignedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
};

export function SignedImage({ src, alt = "", ...rest }: SignedImageProps) {
  const resolved = useSignedUrl(src);
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src={resolved || undefined} alt={alt} {...rest} />;
}
