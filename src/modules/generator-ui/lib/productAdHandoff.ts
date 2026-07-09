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
