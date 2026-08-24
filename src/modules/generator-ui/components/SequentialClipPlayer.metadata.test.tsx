import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SequentialClipPlayer } from './SequentialClipPlayer'

// Three raw private storage paths that must be resolved to three distinct
// signed/proxied URLs before their metadata can be probed.
const RAW = [
  'storage://private/scene-1.mp4',
  'storage://private/scene-2.mp4',
  'storage://private/scene-3.mp4',
]
const RESOLVED = [
  'https://cdn.test/resolved-1.mp4',
  'https://cdn.test/resolved-2.mp4',
  'https://cdn.test/resolved-3.mp4',
]

vi.mock('@/modules/generator-ui/lib/usePlayableVideoUrl', () => ({
  usePlayableVideoUrl: (src: string | null) => ({ url: src, loading: false, reload: vi.fn() }),
  usePlayableVideoUrls: (srcs: (string | null)[]) => ({
    urls: srcs.map((s, i) => (s ? RESOLVED[i] : undefined)),
  }),
}))

vi.mock('@/modules/generator-ui/components/PreviewSoundtrackWaveforms', async () => {
  const { forwardRef } = await import('react')
  return { PreviewSoundtrackWaveforms: forwardRef(() => null) }
})

function makeClips() {
  return RAW.map((src, i) => ({
    kind: 'video' as const,
    id: `scene-${i + 1}`,
    src,
    ratio: '16:9' as const,
  }))
}

const baseProps = {
  ratioToCss: () => '16 / 9',
  ratioToHeight: () => '20rem',
  ratioToWidth: () => '36rem',
  maxHeightPx: 480,
}

describe('SequentialClipPlayer metadata probe uses resolved URLs', () => {
  let createdVideos: HTMLVideoElement[]
  let origCreate: typeof document.createElement

  beforeEach(() => {
    createdVideos = []
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn(() => Promise.resolve()),
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: vi.fn(),
    })
    origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: unknown) => {
      const el = origCreate(tag, opts as ElementCreationOptions)
      if (tag === 'video') createdVideos.push(el as HTMLVideoElement)
      return el
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // The metadata probe creates detached <video preload="metadata"> elements;
  // the active/prefetch players use preload="auto".
  const probeVideos = () => createdVideos.filter((v) => v.preload === 'metadata')

  const fireMetadata = (el: HTMLVideoElement, dur: number) => {
    Object.defineProperty(el, 'duration', { value: dur, configurable: true })
    el.dispatchEvent(new Event('loadedmetadata'))
  }

  it('probes each clip with its resolved URL and totals 0:15 for three 5s clips', async () => {
    render(<SequentialClipPlayer {...baseProps} clips={makeClips()} />)

    const probes = probeVideos()
    expect(probes).toHaveLength(3)
    // Prove the probe used the RESOLVED URL, not the raw storage path.
    expect(probes.map((p) => p.src)).toEqual(RESOLVED)

    probes.forEach((p) => fireMetadata(p, 5))

    await waitFor(() => {
      expect(screen.getByText('0:15')).toBeInTheDocument()
    })
    // The seek range spans the full film (3 × 5s), not a single clip.
    expect(screen.getByRole('slider', { name: 'Seek film' })).toHaveAttribute('aria-valuemax', '15')
  })

  it('does not crash when one clip metadata fails; other clips stay playable', async () => {
    render(<SequentialClipPlayer {...baseProps} clips={makeClips()} />)

    const probes = probeVideos()
    expect(probes).toHaveLength(3)

    // First clip's metadata fails to load; the player must keep going.
    probes[0].dispatchEvent(new Event('error'))
    fireMetadata(probes[1], 5)
    fireMetadata(probes[2], 5)

    await waitFor(() => {
      expect(screen.getByText('0:10')).toBeInTheDocument()
    })
  })
})
