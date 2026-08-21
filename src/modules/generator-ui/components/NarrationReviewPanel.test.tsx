import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NarrationReviewPanel } from './NarrationReviewPanel'

const { mockInvoke, mockProxiedVideoUrl, mockExtractAudio } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockProxiedVideoUrl: vi.fn(),
  mockExtractAudio: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}))

vi.mock('@/modules/generator-ui/lib/proxiedVideoUrl', () => ({
  proxiedVideoUrl: (...args: unknown[]) => mockProxiedVideoUrl(...args),
}))

vi.mock('@/modules/generator-ui/lib/extractAudio', () => ({
  extractAudioAsBase64: (...args: unknown[]) => mockExtractAudio(...args),
}))

function videoResponse(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    blob: async () => new Blob(['film-bytes'], { type: 'video/mp4' }),
  } as Response
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockProxiedVideoUrl.mockImplementation(async (url: string) => `https://project.supabase.co/signed/${url}`)
  vi.stubGlobal('fetch', vi.fn(async () => videoResponse()))
})

describe('NarrationReviewPanel film transcription', () => {
  it('transcribes the selected film automatically and shows the heard speech with a transcript-only verdict when no expected narration is saved', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { transcript: 'Words actually spoken in the selected film.', words: [] },
      error: null,
    })

    render(
      <NarrationReviewPanel
        open
        onClose={vi.fn()}
        videoStoragePath="films/card-a.mp4"
      />,
    )

    expect(screen.getByText('Loading the selected film…')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText('Words actually spoken in the selected film.')).toBeInTheDocument(),
    )
    expect(mockProxiedVideoUrl).toHaveBeenCalledWith('films/card-a.mp4')
    expect(mockInvoke).toHaveBeenCalledWith('narration-review', {
      body: { videoUrl: 'https://project.supabase.co/signed/films/card-a.mp4' },
    })
    // No expected narration was provided, so the panel shows a transcript-only
    // verdict and must NOT derive expected narration from the prompt.
    expect(screen.getByText('Transcript only')).toBeInTheDocument()
    expect(screen.queryByText(/from prompt/i)).not.toBeInTheDocument()
  })

  it('shows a distinct no-speech state for a silent film', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { transcript: '', words: [], code: 'NO_SPEECH', error: 'No speech detected in this film.' },
      error: null,
    })

    render(
      <NarrationReviewPanel
        open
        onClose={vi.fn()}
        videoStoragePath="films/silent.mp4"
      />,
    )

    await waitFor(() =>
      expect(screen.getByText('No speech was detected in this film.')).toBeInTheDocument(),
    )
    expect(screen.getByText(/silent, contain music only/i)).toBeInTheDocument()
  })

  it('shows an expired URL error and Retry starts a fresh transcription', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(videoResponse(403))
      .mockResolvedValueOnce(videoResponse())
    mockInvoke.mockResolvedValueOnce({
      data: { transcript: 'Fresh signed URL transcript.' },
      error: null,
    })

    render(
      <NarrationReviewPanel
        open
        onClose={vi.fn()}
        videoStoragePath="films/expiring.mp4"
      />,
    )

    await waitFor(() =>
      expect(screen.getByText(/film URL expired/i)).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() =>
      expect(screen.getByText('Fresh signed URL transcript.')).toBeInTheDocument(),
    )
    expect(mockProxiedVideoUrl).toHaveBeenCalledTimes(2)
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('shows a clear timeout state when media preparation does not finish', async () => {
    vi.useFakeTimers()
    mockProxiedVideoUrl.mockImplementationOnce(() => new Promise(() => {}))

    try {
      render(
        <NarrationReviewPanel
          open
          onClose={vi.fn()}
          videoStoragePath="films/stalled.mp4"
        />,
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })
      expect(screen.getByText('Transcription timed out. Please retry.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not let a late response from the previous card overwrite the new card', async () => {
    const cardA = deferred<{ data: { transcript: string }; error: null }>()
    mockInvoke
      .mockImplementationOnce(() => cardA.promise)
      .mockResolvedValueOnce({ data: { transcript: 'Card B speech' }, error: null })

    const view = render(
      <NarrationReviewPanel
        open
        onClose={vi.fn()}
        videoStoragePath="films/card-a.mp4"
      />,
    )
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1))

    view.rerender(
      <NarrationReviewPanel
        open
        onClose={vi.fn()}
        videoStoragePath="films/card-b.mp4"
      />,
    )
    await waitFor(() => expect(screen.getByText('Card B speech')).toBeInTheDocument())

    cardA.resolve({ data: { transcript: 'Late Card A speech' }, error: null })
    await Promise.resolve()
    expect(screen.queryByText('Late Card A speech')).not.toBeInTheDocument()
    expect(screen.getByText('Card B speech')).toBeInTheDocument()
  })

  it('ignores a response that arrives after the dialog closes', async () => {
    const pending = deferred<{ data: { transcript: string }; error: null }>()
    mockInvoke.mockImplementationOnce(() => pending.promise)

    const view = render(
      <NarrationReviewPanel
        open
        onClose={vi.fn()}
        videoStoragePath="films/card-a.mp4"
      />,
    )
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1))

    view.rerender(
      <NarrationReviewPanel
        open={false}
        onClose={vi.fn()}
        videoStoragePath="films/card-a.mp4"
      />,
    )
    pending.resolve({ data: { transcript: 'Too late' }, error: null })
    await Promise.resolve()
    expect(screen.queryByText('Too late')).not.toBeInTheDocument()
  })
})
