import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
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

    const view = render(<StrictMode><SequentialClipPlayer {...props} /></StrictMode>)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument())
    expect(play).toHaveBeenCalledTimes(1)

    view.rerender(<StrictMode><SequentialClipPlayer {...props} /></StrictMode>)
    expect(play).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('resets a second batch to its first clip and autoplays once after the previous film paused or ended', async () => {
    play.mockResolvedValue()
    const baseProps = {
      ratioToCss: () => '16 / 9',
      ratioToHeight: () => '20rem',
      ratioToWidth: () => '36rem',
      maxHeightPx: 480,
    }
    const firstClips = [
      { kind: 'video' as const, id: 'scene-1', src: 'https://example.test/scene-1.mp4', ratio: '16:9' as const },
      { kind: 'video' as const, id: 'scene-2', src: 'https://example.test/scene-2.mp4', ratio: '16:9' as const },
    ]
    const view = render(
      <StrictMode>
        <SequentialClipPlayer
          {...baseProps}
          clips={firstClips}
          autoPlayAttemptId="make-full-film:first"
        />
      </StrictMode>,
    )

    await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    const firstVideo = view.container.querySelector('video:not([aria-hidden="true"])')
    expect(firstVideo).not.toBeNull()
    fireEvent.ended(firstVideo as HTMLVideoElement)
    await waitFor(() => expect(view.container.querySelector('video:not([aria-hidden="true"])')).toHaveAttribute('src', 'https://example.test/scene-2.mp4'))
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    const callsBeforeSecondBatch = play.mock.calls.length

    const secondClips = [
      { kind: 'video' as const, id: 'scene-3', src: 'https://example.test/scene-3.mp4', ratio: '16:9' as const },
      { kind: 'video' as const, id: 'scene-4', src: 'https://example.test/scene-4.mp4', ratio: '16:9' as const },
    ]
    view.rerender(
      <StrictMode>
        <SequentialClipPlayer
          {...baseProps}
          clips={secondClips}
          autoPlayAttemptId="make-full-film:second"
        />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(view.container.querySelector('video:not([aria-hidden="true"])')).toHaveAttribute('src', 'https://example.test/scene-3.mp4')
      expect(play).toHaveBeenCalledTimes(callsBeforeSecondBatch + 1)
    })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })
})
