import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { VoiceoverDialog } from './VoiceoverDialog'

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    storage: { from: () => ({ upload: vi.fn() }) },
    from: () => ({ insert: vi.fn() }),
  },
}))

function renderDialog(props: Partial<Parameters<typeof VoiceoverDialog>[0]> = {}) {
  const onOpenChange = vi.fn()
  const utils = render(
    <VoiceoverDialog
      open
      onOpenChange={onOpenChange}
      onUseAsSoundtrack={vi.fn()}
      {...props}
    />,
  )
  return { onOpenChange, ...utils }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('VoiceoverDialog Start Over reset', () => {
  it('clears transient text when resetKey increments (Start Over)', () => {
    const { rerender } = renderDialog({ resetKey: 0 })

    const textarea = screen.getByLabelText('Text') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Previous project narration' } })
    expect(textarea.value).toBe('Previous project narration')

    // Start Over bumps resetKey — the dialog must clear its transient text.
    rerender(
      <VoiceoverDialog
        open
        onOpenChange={vi.fn()}
        onUseAsSoundtrack={vi.fn()}
        resetKey={1}
      />,
    )

    const after = screen.getByLabelText('Text') as HTMLTextAreaElement
    expect(after.value).toBe('')
  })

  it('preserves text across close/reopen of the same project (resetKey unchanged)', () => {
    const { rerender } = renderDialog({ resetKey: 0 })

    const textarea = screen.getByLabelText('Text') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Keep me on reopen' } })

    // Close then reopen with the same resetKey — text must be preserved.
    rerender(
      <VoiceoverDialog
        open={false}
        onOpenChange={vi.fn()}
        onUseAsSoundtrack={vi.fn()}
        resetKey={0}
      />,
    )
    rerender(
      <VoiceoverDialog
        open
        onOpenChange={vi.fn()}
        onUseAsSoundtrack={vi.fn()}
        resetKey={0}
      />,
    )

    const after = screen.getByLabelText('Text') as HTMLTextAreaElement
    expect(after.value).toBe('Keep me on reopen')
  })

  it('does not clear text when resetKey stays at its initial value', () => {
    renderDialog({ resetKey: 0 })

    const textarea = screen.getByLabelText('Text') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Stable text' } })
    expect(textarea.value).toBe('Stable text')
  })
})
