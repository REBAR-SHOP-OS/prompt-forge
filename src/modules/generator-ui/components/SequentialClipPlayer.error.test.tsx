import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SequentialClipPlayer } from './SequentialClipPlayer'

// A broken clip (expired proxy token / private URL) must not stall Preview:
// the first error re-resolves the URL once, and a second error skips to the
// next clip so the sequence keeps moving.

const reload = vi.fn()

vi.mock('@/modules/generator-ui/lib/usePlayableVideoUrl', () => ({
  usePlayableVideoUrl: (src: string | null) => ({ url: src, loading: false, reload }),
  usePlayableVideoUrls: (srcs: (string | null)[]) => ({ urls: srcs }),
}))

vi.mock('@/modules/generator-ui/components/PreviewSoundtrackWaveforms', async () => {
  const { forwardRef } = await import('react')
  return { PreviewSoundtrackWaveforms: forwardRef(() => null) }
})

const baseProps = {
  ratioToCss: () => '16 / 9',
  ratioToHeight: () => '20rem',
  ratioToWidth: () => '36rem',
  maxHeightPx: 480,
}

function makeClips() {
  return [
    { kind: 'video' as const, id: 'scene-1', src: 'https://example.test/scene-1.mp4', ratio: '16:9' as const },
    { kind: 'video' as const, id: 'scene-2', src: 'https://example.test/scene-2.mp4', ratio: '16:9' as const },
  ]
}

describe('SequentialClipPlayer broken-clip recovery', () => {
  beforeEach(() => {
    reload.mockReset()
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn(() => Promise.resolve()),
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('re-resolves once on first error, then skips to the next clip on a second error', async () => {
    const view = render(<SequentialClipPlayer {...baseProps} clips={makeClips()} />)

    await waitFor(() => {
      expect(view.container.querySelector('video:not([aria-hidden="true"])')).toHaveAttribute(
        'src',
        'https://example.test/scene-1.mp4',
      )
    })

    const activeVideo = () => view.container.querySelector('video:not([aria-hidden="true"])')

    // First error → one re-resolve attempt, still on scene-1.
    fireEvent.error(activeVideo() as HTMLVideoElement)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(activeVideo()).toHaveAttribute('src', 'https://example.test/scene-1.mp4')

    // Second error on the same clip → skip to scene-2 (no stall).
    fireEvent.error(activeVideo() as HTMLVideoElement)
    await waitFor(() => {
      expect(activeVideo()).toHaveAttribute('src', 'https://example.test/scene-2.mp4')
    })
  })

  it('does not re-resolve a second clip after the first was skipped', async () => {
    const view = render(<SequentialClipPlayer {...baseProps} clips={makeClips()} />)

    await waitFor(() => {
      expect(view.container.querySelector('video:not([aria-hidden="true"])')).toHaveAttribute(
        'src',
        'https://example.test/scene-1.mp4',
      )
    })

    const activeVideo = () => view.container.querySelector('video:not([aria-hidden="true"])')

    // Exhaust scene-1: first error reloads, second skips to scene-2.
    fireEvent.error(activeVideo() as HTMLVideoElement)
    fireEvent.error(activeVideo() as HTMLVideoElement)
    await waitFor(() => {
      expect(activeVideo()).toHaveAttribute('src', 'https://example.test/scene-2.mp4')
    })

    // A fresh clip gets a fresh error budget: first error on scene-2 reloads
    // (not an immediate skip), proving the guard is per-clip.
    const callsAfterSkip = reload.mock.calls.length
    fireEvent.error(activeVideo() as HTMLVideoElement)
    expect(reload.mock.calls.length).toBe(callsAfterSkip + 1)
  })
})
