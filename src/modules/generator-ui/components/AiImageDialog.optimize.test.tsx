import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import AiImageDialog from './AiImageDialog'

// Mock the supabase client so the optimize-prompt edge-function call is fully
// controlled. Mirrors the pattern used by the other generator-ui tests.
const { mockInvoke } = vi.hoisted(() => {
  const mockInvoke = vi.fn()
  return { mockInvoke }
})

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({})),
    storage: { from: vi.fn() },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}))

const onSaved = vi.fn()

function renderDialog() {
  return render(
    <AiImageDialog
      open
      onOpenChange={vi.fn()}
      userId="user-1"
      defaultAspect="1:1"
      onSaved={onSaved}
    />,
  )
}

function promptTextarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(
    /dark industrial workshop with glowing blue rebar stirrups/i,
  ) as HTMLTextAreaElement
}

function optimizeButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /optimize prompt with ai/i }) as HTMLButtonElement
}

beforeEach(() => {
  mockInvoke.mockReset()
  onSaved.mockClear()
})

describe('AiImageDialog prompt optimization', () => {
  it('does not invoke the edge function when the prompt is empty', async () => {
    renderDialog()
    const btn = optimizeButton()
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('replaces the prompt with the enhanced text on success and offers undo', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { enhancedPrompt: 'A cinematic optimized prompt.' }, error: null })
    renderDialog()
    const ta = promptTextarea()
    fireEvent.change(ta, { target: { value: 'A rough idea' } })
    fireEvent.click(optimizeButton())

    expect(mockInvoke).toHaveBeenCalledWith('enhance-prompt', { body: { prompt: 'A rough idea' } })

    await waitFor(() => expect(ta.value).toBe('A cinematic optimized prompt.'))
    expect(screen.getByText('Prompt optimized.')).toBeInTheDocument()
    // Undo restores the original text.
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    await waitFor(() => expect(ta.value).toBe('A rough idea'))
    expect(screen.queryByText('Prompt optimized.')).not.toBeInTheDocument()
  })

  it('keeps the original prompt and shows an error when the call fails', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: { context: { json: async () => ({ error: 'Rate limit reached. Try again in a moment.' }) } },
    })
    renderDialog()
    const ta = promptTextarea()
    fireEvent.change(ta, { target: { value: 'Keep me' } })
    fireEvent.click(optimizeButton())

    await waitFor(() =>
      expect(screen.getByText('Rate limit reached. Try again in a moment.')).toBeInTheDocument(),
    )
    // Original text is preserved.
    expect(ta.value).toBe('Keep me')
    // No undo banner (nothing was replaced).
    expect(screen.queryByText('Prompt optimized.')).not.toBeInTheDocument()
  })

  it('ignores a repeated click while a request is in flight', async () => {
    let resolveInvoke: (v: unknown) => void = () => {}
    mockInvoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInvoke = resolve
        }),
    )
    renderDialog()
    const ta = promptTextarea()
    fireEvent.change(ta, { target: { value: 'Idea' } })
    fireEvent.click(optimizeButton())
    fireEvent.click(optimizeButton())
    fireEvent.click(optimizeButton())

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    resolveInvoke({ data: { enhancedPrompt: 'Done.' }, error: null })
    await waitFor(() => expect(ta.value).toBe('Done.'))
  })

  it('shows a loading state and disables the button while processing', async () => {
    let resolveInvoke: (v: unknown) => void = () => {}
    mockInvoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInvoke = resolve
        }),
    )
    renderDialog()
    fireEvent.change(promptTextarea(), { target: { value: 'Idea' } })
    fireEvent.click(optimizeButton())

    // Button reflects the loading state and is disabled (no repeat click).
    expect(optimizeButton()).toBeDisabled()
    resolveInvoke({ data: { enhancedPrompt: 'Done.' }, error: null })
    await waitFor(() => expect(promptTextarea().value).toBe('Done.'))
  })
})
