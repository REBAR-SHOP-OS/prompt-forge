import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  const onUseAsSoundtrack = vi.fn()
  const utils = render(
    <VoiceoverDialog
      open
      onOpenChange={onOpenChange}
      onUseAsSoundtrack={onUseAsSoundtrack}
      {...props}
    />,
  )
  return { onOpenChange, onUseAsSoundtrack, ...utils }
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:voiceover-test'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
})

describe('VoiceoverDialog script reset', () => {
  it('clears the script when resetKey increments', () => {
    const { rerender } = renderDialog({ resetKey: 0 })
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Previous project narration' },
    })

    rerender(
      <VoiceoverDialog
        open
        onOpenChange={vi.fn()}
        onUseAsSoundtrack={vi.fn()}
        resetKey={1}
      />,
    )

    expect(screen.getByLabelText('Text')).toHaveValue('')
  })

  it('preserves the script across a normal close and reopen', () => {
    const { rerender } = renderDialog({ resetKey: 0 })
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Keep this draft' },
    })

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

    expect(screen.getByLabelText('Text')).toHaveValue('Keep this draft')
  })

  it('clears the script directly with Clear', () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Clear this narration' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear script' }))

    expect(screen.getByLabelText('Text')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear script' })).not.toBeInTheDocument()
  })

  it('clears the script after applying generated audio', async () => {
    mockInvoke.mockResolvedValue({
      data: { audioBase64: 'QQ==', mimeType: 'audio/wav' },
      error: null,
    })
    const { onUseAsSoundtrack } = renderDialog()
    fireEvent.change(screen.getByLabelText('Text'), {
      target: { value: 'Apply this narration' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Generate voiceover' }))
    const applyButton = screen.getByRole('button', { name: 'Use as soundtrack' })
    await waitFor(() => expect(applyButton).toBeEnabled())
    fireEvent.click(applyButton)

    expect(onUseAsSoundtrack).toHaveBeenCalledWith(
      'blob:voiceover-test',
      expect.stringContaining('Voiceover'),
    )
    expect(screen.getByLabelText('Text')).toHaveValue('')
  })
})
