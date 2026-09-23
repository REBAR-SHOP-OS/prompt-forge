import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  imageAspectCss,
  imageRatioPreset,
  readImageFileDimensions,
  recoverableImageDimensions,
  validImageDimensions,
} from './imageAspect'

describe('uploaded image aspect helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    [1080, 1920, '9:16'],
    [1024, 1024, '1:1'],
    [1920, 1080, '16:9'],
  ] as const)('classifies %sx%s as %s for sequence playback', (width, height, expected) => {
    expect(imageRatioPreset(width, height, '16:9')).toBe(expected)
  })

  it('preserves an arbitrary intrinsic ratio for CSS layout', () => {
    expect(imageAspectCss(1234, 777, '16 / 9')).toBe('1234 / 777')
  })

  it('uses the supplied fallback for invalid dimensions', () => {
    expect(validImageDimensions(0, 1920)).toBeNull()
    expect(validImageDimensions(Number.NaN, 1080)).toBeNull()
    expect(imageAspectCss(null, undefined, '1 / 1')).toBe('1 / 1')
    expect(imageRatioPreset(-1, 900, '9:16')).toBe('9:16')
  })

  it('reads upload dimensions from the selected image file', async () => {
    const close = vi.fn()
    const createBitmap = vi.fn().mockResolvedValue({ width: 1080, height: 1920, close })
    vi.stubGlobal('createImageBitmap', createBitmap)

    await expect(readImageFileDimensions(new Blob(['image']))).resolves.toEqual({ width: 1080, height: 1920 })
    expect(createBitmap).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('recovers legacy null dimensions from browser intrinsic measurements', () => {
    expect(recoverableImageDimensions(null, null, 900, 1600)).toEqual({ width: 900, height: 1600 })
  })

  it('does not request another recovery once stored dimensions are valid', () => {
    expect(recoverableImageDimensions(900, 1600, 900, 1600)).toBeNull()
  })
})
