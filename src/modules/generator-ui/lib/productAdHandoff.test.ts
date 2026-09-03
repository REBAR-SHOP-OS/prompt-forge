import { describe, expect, it, vi } from 'vitest'
import { prepareProductStartFrameImage, stageProductAdStartFrame } from './productAdHandoff'

describe('stageProductAdStartFrame', () => {
  it('does nothing when the dialog produced no frame', async () => {
    const stage = vi.fn()
    await expect(stageProductAdStartFrame(undefined, stage)).resolves.toBeUndefined()
    expect(stage).not.toHaveBeenCalled()
  })

  it('resolves when staging succeeds', async () => {
    const stage = vi.fn().mockResolvedValue(true)
    await expect(stageProductAdStartFrame('https://x/frame.png', stage)).resolves.toBeUndefined()
    expect(stage).toHaveBeenCalledWith('https://x/frame.png')
  })

  it('throws a user-facing error when staging fails, so the dialog stays open', async () => {
    const stage = vi.fn().mockResolvedValue(false)
    await expect(stageProductAdStartFrame('https://x/frame.png', stage)).rejects.toThrow(
      /Could not stage the Product Ad start frame/,
    )
  })

  it('propagates unexpected staging rejections', async () => {
    const stage = vi.fn().mockRejectedValue(new Error('network down'))
    await expect(stageProductAdStartFrame('https://x/frame.png', stage)).rejects.toThrow('network down')
  })
})

describe('prepareProductStartFrameImage', () => {
  it('normalizes the product to the selected 9:16 ratio without cropping it', async () => {
    const normalize = vi.fn().mockResolvedValue('data:image/png;base64,portrait')

    await expect(
      prepareProductStartFrameImage('https://x/product-square.png', '9:16', normalize),
    ).resolves.toBe('data:image/png;base64,portrait')

    expect(normalize).toHaveBeenCalledWith(
      'https://x/product-square.png',
      '9:16',
      { fit: 'contain', backgroundColor: '#ffffff' },
    )
  })

  // The caller (productStartFrame) catches and returns undefined, and the clip
  // then generates with no product conditioning at all. An off-ratio product
  // frame is a far better outcome than no product frame, so a canvas failure
  // must degrade rather than propagate.
  it('falls back to the original image when normalization fails', async () => {
    const normalize = vi.fn().mockRejectedValue(new Error('Failed to load image'))

    await expect(
      prepareProductStartFrameImage('https://x/product-square.png', '9:16', normalize),
    ).resolves.toBe('https://x/product-square.png')

    expect(normalize).toHaveBeenCalledOnce()
  })

  it('falls back on a synchronous throw too', async () => {
    const normalize = vi.fn(() => {
      throw new Error('SecurityError: tainted canvas')
    })

    await expect(
      prepareProductStartFrameImage('https://x/product-square.png', '16:9', normalize),
    ).resolves.toBe('https://x/product-square.png')
  })
})
