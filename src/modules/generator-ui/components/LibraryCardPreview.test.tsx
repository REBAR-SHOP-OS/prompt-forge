import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LibraryCardPreview } from '@/modules/generator-ui/components/LibraryCardPreview'
import { resolveDraftLibraryPreview } from '@/modules/generator-ui/lib/libraryCardPreview'
import type { JobDetail } from '@/modules/job-orchestrator/contract'

vi.mock('@/modules/generator-ui/components/PlayableVideo', () => ({
  PlayableVideo: ({ src }: { src: string }) => <div data-testid="playable-video" data-src={src} />,
}))

const signUserImageUrl = vi.fn(async (path: string) => `https://signed.example/${path}?token=abc`)
vi.mock('@/modules/generator-ui/lib/userImageUrl', () => ({
  signUserImageUrl: (path: string) => signUserImageUrl(path),
}))

const videoEntry = {
  id: 'video-project',
  requested_aspect_ratio: '16:9',
  video: {
    id: 'video-asset',
    storage_path: 'videos/project.mp4',
    thumbnail_url: 'posters/project.jpg',
    aspect_ratio: '16:9',
    duration: 12,
  },
} as JobDetail

describe('LibraryCardPreview', () => {
  it('selects and renders an image element for an image-only draft', () => {
    const preview = resolveDraftLibraryPreview(
      'image-project',
      [],
      [{ storage_path: 'https://signed.example/uploaded-image.jpg' }],
      {
        ...videoEntry,
        id: 'image-project',
        video: {
          ...videoEntry.video!,
          storage_path: 'https://signed.example/uploaded-image.jpg',
        },
      },
    )

    render(<LibraryCardPreview preview={preview} />)

    expect(screen.getByRole('img', { name: 'Project preview' })).toHaveAttribute(
      'src',
      'https://signed.example/uploaded-image.jpg',
    )
    expect(screen.queryByTestId('playable-video')).not.toBeInTheDocument()
  })

  it('keeps actual video drafts on the playable-video preview path', () => {
    const preview = resolveDraftLibraryPreview('video-project', [videoEntry], [], videoEntry)

    render(<LibraryCardPreview preview={preview} videoSrc="https://signed.example/project.mp4" />)

    expect(screen.getByTestId('playable-video')).toHaveAttribute(
      'data-src',
      'https://signed.example/project.mp4',
    )
    expect(screen.queryByRole('img', { name: 'Project preview' })).not.toBeInTheDocument()
  })

  it('keeps persisted final video entries on the video fallback path', () => {
    const preview = resolveDraftLibraryPreview('video-project', [], [], videoEntry)

    expect(preview).toMatchObject({
      kind: 'video',
      video: { storage_path: 'videos/project.mp4' },
    })
  })
})

/**
 * A stored `storage_path` is a PUBLIC-bucket URL into a PRIVATE bucket, which
 * returns 400/"Bucket not found" when a browser loads it in an <img> (see
 * resolveImageBucketKey). Rendering the image preview as a bare <img> would
 * therefore show the broken-image glyph for exactly the paths this feature
 * exists to display — the tests above only pass because they hand in an
 * already-signed https URL. The preview must go through UserImageView, which
 * re-signs once on error and falls back to a clean placeholder.
 */
describe('LibraryCardPreview image recovery', () => {
  it('re-signs an unsigned storage path instead of leaving a broken image', async () => {
    signUserImageUrl.mockClear()
    const rawPath = 'user-images/abc/photo.jpg'

    render(
      <LibraryCardPreview preview={{ kind: 'image', image: { storage_path: rawPath } }} />,
    )

    const img = screen.getByRole('img', { name: 'Project preview' })
    expect(img).toHaveAttribute('src', rawPath)

    // What the browser does when the unsigned public-bucket URL 400s.
    fireEvent.error(img)

    await waitFor(() => {
      expect(signUserImageUrl).toHaveBeenCalledWith(rawPath)
      expect(screen.getByRole('img', { name: 'Project preview' })).toHaveAttribute(
        'src',
        `https://signed.example/${rawPath}?token=abc`,
      )
    })
  })
})
