import {
  normalizeImageAspect,
  type AspectRatio,
  type NormalizeImageAspectOptions,
} from './normalizeImageAspect'

/**
 * Product Ad → composer Start-frame handoff.
 *
 * The Product Ad dialog produces a composed opening frame that must be staged
 * through the same wan-frames upload path as normal Image-to-Video uploads
 * before a job can be created. The stage function reports success; a silent
 * failure here is what previously let generations submit without a valid
 * firstFrameUrl.
 */
export async function stageProductAdStartFrame(
  imageUrl: string | undefined,
  stage: (url: string) => Promise<boolean>,
): Promise<void> {
  if (!imageUrl) return
  const staged = await stage(imageUrl)
  if (!staged) {
    throw new Error(
      'Could not stage the Product Ad start frame. Check the Start frame thumbnail in the composer, then retry or attach the image manually.',
    )
  }
}

/**
 * Convert a product reference into an exact-ratio Start frame before it enters
 * the video pipeline. `contain` deliberately preserves the whole product;
 * cropping a reference image can remove load-bearing geometry or branding.
 *
 * Normalization is an improvement, not a precondition. It runs in the browser
 * on a canvas, so it can fail for reasons that have nothing to do with the
 * product: the <img> never loads, the 2D context is unavailable, `toDataURL`
 * refuses. Letting that reject would be a worse outcome than an off-ratio
 * frame — `productStartFrame` swallows the throw and returns undefined, and the
 * clip then generates with no product conditioning at all, which is the exact
 * failure this whole path exists to prevent. Fall back to the original URL.
 */
export async function prepareProductStartFrameImage(
  imageUrl: string,
  aspectRatio: AspectRatio,
  normalize: (
    url: string,
    aspect: AspectRatio,
    options: NormalizeImageAspectOptions,
  ) => Promise<string> = normalizeImageAspect,
): Promise<string> {
  try {
    return await normalize(imageUrl, aspectRatio, {
      fit: 'contain',
      backgroundColor: '#ffffff',
    })
  } catch {
    return imageUrl
  }
}
