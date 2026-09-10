import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TranscriptPanel } from './TranscriptPanel'

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}))

vi.mock('../lib/extractAudio', () => ({
  extractAudioAsBase64: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(['video']),
  })))
})

describe('TranscriptPanel language selection', () => {
  it('keeps the panel and original text visible while translating, then shows the selected translation', async () => {
    const translation = deferred<{ data: { translatedText: string }; error: null }>()
    mockInvoke
      .mockResolvedValueOnce({
        data: { transcript: 'Original transcript', words: [] },
        error: null,
      })
      .mockReturnValueOnce(translation.promise)
    const onClose = vi.fn()

    render(<TranscriptPanel videoUrl="https://example.test/video.mp4" onClose={onClose} />)

    await screen.findByText('Original transcript')
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Persian' }))

    expect(screen.getByText('Transcript')).toBeInTheDocument()
    expect(screen.getByText('Original transcript')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveTextContent('Persian')
    expect(screen.getByText('Translating…')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    translation.resolve({ data: { translatedText: 'ترجمه فارسی' }, error: null })

    await screen.findByText('ترجمه فارسی')
    expect(mockInvoke).toHaveBeenLastCalledWith('video-transcript', {
      body: { transcript: 'Original transcript', targetLanguage: 'Persian' },
    })

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Original' }))
    await waitFor(() => expect(screen.queryByText('ترجمه فارسی')).not.toBeInTheDocument())
    expect(screen.getByText('Original transcript')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close transcript' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
