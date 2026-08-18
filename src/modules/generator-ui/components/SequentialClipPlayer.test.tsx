import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SequentialClipPlayer } from './SequentialClipPlayer'

vi.mock('@/modules/generator-ui/lib/usePlayableVideoUrl', () => ({
  usePlayableVideoUrl: (src: string | null) => ({ url: src, loading: false, reload: vi.fn() }),
  usePlayableVideoUrls: (srcs: (string | null)[]) => ({ urls: srcs }),
}))

vi.mock('@/modules/generator-ui/components/PreviewSoundtrackWaveforms', async () => {
  const { forwardRef } = await import('react')
  return { PreviewSoundtrackWaveforms: forwardRef(() => null) }
})

describe('SequentialClipPlayer batch autoplay', () => {
  const play = vi.fn<() => Promise<void>>()

  beforeEach(() => {
    play.mockReset()
    play.mockRejectedValue(new DOMException('Autoplay blocked', 'NotAllowedError'))
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: play,
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('attempts batch autoplay once, stays open on rejection, and keeps manual Play available', async () => {
    const props = {
      clips: [
        {
          kind: 'video' as const,
          id: 'scene-1',
          src: 'https://example.test/scene-1.mp4',
          ratio: '16:9' as const,
        },
      ],
      ratioToCss: () => '16 / 9',
      ratioToHeight: () => '20rem',
      ratioToWidth: () => '36rem',
      maxHeightPx: 480,
      autoPlayAttemptId: 'make-full-film:scene-1',
    }

    const view = render(<SequentialClipPlayer {...props} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument())
    expect(play).toHaveBeenCalledTimes(1)

    view.rerender(<SequentialClipPlayer {...props} />)
    expect(play).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })
})
