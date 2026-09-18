import { describe, expect, it } from 'vitest'

import source from './DashboardPage.tsx?raw'

describe('DashboardPage uploaded image intrinsic aspect integration', () => {
  it('measures the selected file and persists width and height with the uploaded row', () => {
    expect(source).toContain('const intrinsicDimensions = await readImageFileDimensions(file)')
    expect(source).toContain('width: intrinsicDimensions?.width ?? null')
    expect(source).toContain('height: intrinsicDimensions?.height ?? null')
  })

  it('maps sequence images from their own dimensions instead of the project ratio', () => {
    expect(source).toContain('ratio: imageRatioPreset(')
    expect(source).toContain('c.image.width,\n                      c.image.height,')
  })

  it('uses exact intrinsic CSS aspect ratios in standalone preview and image cards', () => {
    expect(source).toContain('const previewImageAspect = previewItem?.kind === \'image\'')
    expect(source).toContain('aspectRatio: previewImageAspect')
    expect(source).toContain('aspectRatio: imageAspectCss(\n                              img.width,\n                              img.height,')
  })

  it('self-heals legacy null dimensions once and updates every local image snapshot', () => {
    expect(source).toContain('recoveringImageDimensionsRef.current.has(image.id)')
    expect(source).toContain(".from('generator_user_images')\n      .update(dimensions)")
    expect(source).toContain(".eq('user_id', userId)")
    expect(source).toContain('setUserImages(updateItems)')
    expect(source).toContain('setProjectSourceImages((previous) => {')
    expect(source).toContain('setDraftSourceImages((previous) => {')
    expect(source).toContain('onIntrinsicSize={validImageDimensions(img.width, img.height) ? undefined')
  })
})
