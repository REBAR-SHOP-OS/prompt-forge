import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeImageAspect } from './normalizeImageAspect'

describe('normalizeImageAspect contain mode', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('places a square product intact on an exact 1080x1920 canvas', async () => {
    class FakeImage {
      crossOrigin = ''
      naturalWidth = 1000
      naturalHeight = 1000
      onload: (() => void) | null = null
      onerror: ((error: unknown) => void) | null = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    const context = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toDataURL: vi.fn(() => 'data:image/png;base64,portrait'),
    }

    vi.stubGlobal('Image', FakeImage)
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'canvas') return canvas as unknown as HTMLCanvasElement
      return createElement(tagName)
    }) as typeof document.createElement)

    await expect(
      normalizeImageAspect('https://x/product-square.png', '9:16', {
        fit: 'contain',
        backgroundColor: '#ffffff',
      }),
    ).resolves.toBe('data:image/png;base64,portrait')

    expect(canvas.width).toBe(1080)
    expect(canvas.height).toBe(1920)
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1080, 1920)
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.any(FakeImage),
      0,
      420,
      1080,
      1080,
    )
  })
})
