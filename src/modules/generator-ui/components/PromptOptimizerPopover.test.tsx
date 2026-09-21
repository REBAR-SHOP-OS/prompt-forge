import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PromptOptimizerPopover, type PromptOptimizationRequest } from './PromptOptimizerPopover'

vi.mock('@/modules/generator-ui/components/StylePreviewCard', () => ({
  StylePreviewCard: ({ title, onSelect }: { title: string; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>{title}</button>
  ),
}))

function Harness({
  initialPrompt = 'A rough product video',
  durationSeconds = 5,
  onOptimize = vi.fn(),
}: {
  initialPrompt?: string
  durationSeconds?: number
  onOptimize?: (request: PromptOptimizationRequest) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <PromptOptimizerPopover
      open={open}
      onOpenChange={setOpen}
      initialPrompt={initialPrompt}
      durationSeconds={durationSeconds}
      onOptimize={onOptimize}
    />
  )
}

function openOptimizer() {
  fireEvent.click(screen.getByRole('button', { name: 'Enhance prompt with AI' }))
  return screen.getByRole('textbox', { name: 'Prompt' }) as HTMLTextAreaElement
}

describe('PromptOptimizerPopover', () => {
  it('opens a focused optimizer with the current composer prompt and no scenario controls', () => {
    render(<Harness />)

    const prompt = openOptimizer()

    expect(screen.getByLabelText('Prompt optimizer')).toBeInTheDocument()
    expect(prompt).toHaveValue('A rough product video')
    expect(prompt).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Without narration' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Narration text')).not.toBeInTheDocument()
    expect(screen.queryByText(/Scenario for this product/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /write scenario/i })).not.toBeInTheDocument()
  })

  it.each([5, 10, 15, 30, 45, 135])(
    'shows and submits the selected %i-second duration',
    (durationSeconds) => {
      const onOptimize = vi.fn()
      render(<Harness durationSeconds={durationSeconds} onOptimize={onOptimize} />)
      openOptimizer()

      expect(screen.getByLabelText('Selected video duration')).toHaveTextContent(
        `Video duration: ${durationSeconds} seconds`,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Optimize prompt' }))

      expect(onOptimize).toHaveBeenCalledWith(expect.objectContaining({ duration: durationSeconds }))
    },
  )

  it('only shows and submits narration text when With narration is selected', () => {
    const onOptimize = vi.fn()
    render(<Harness onOptimize={onOptimize} />)
    openOptimizer()

    fireEvent.click(screen.getByRole('button', { name: 'With narration' }))
    const narration = screen.getByRole('textbox', { name: 'Narration text' })
    fireEvent.change(narration, { target: { value: 'Built stronger, together.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Optimize prompt' }))

    expect(onOptimize).toHaveBeenLastCalledWith(expect.objectContaining({
      prompt: 'A rough product video',
      withNarration: true,
      narratorScript: 'Built stronger, together.',
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Without narration' }))
    expect(screen.queryByRole('textbox', { name: 'Narration text' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Optimize prompt' }))

    expect(onOptimize).toHaveBeenLastCalledWith(expect.objectContaining({
      prompt: 'A rough product video',
      withNarration: false,
    }))
    expect(onOptimize.mock.calls.at(-1)?.[0]).not.toHaveProperty('narratorScript')
  })

  it('keeps styles collapsed until requested and submits selected style hints', () => {
    const onOptimize = vi.fn()
    render(<Harness onOptimize={onOptimize} />)
    openOptimizer()

    const stylesButton = screen.getByRole('button', { name: /Styles/i })
    expect(stylesButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Camera style')).not.toBeInTheDocument()

    fireEvent.click(stylesButton)
    expect(stylesButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Camera style')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Whip Pan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Optimize prompt' }))

    expect(onOptimize).toHaveBeenCalledWith(expect.objectContaining({
      styleHints: expect.stringContaining('Whip pan camera move'),
    }))
  })

  it('requires prompt text and narration text only in narration mode', () => {
    const onOptimize = vi.fn()
    render(<Harness initialPrompt="" onOptimize={onOptimize} />)
    const prompt = openOptimizer()
    const optimize = screen.getByRole('button', { name: 'Optimize prompt' })

    expect(optimize).toBeDisabled()
    fireEvent.change(prompt, { target: { value: 'Steel rising through the skyline' } })
    expect(optimize).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'With narration' }))
    expect(optimize).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Narration text' }), {
      target: { value: 'Engineered for tomorrow.' },
    })
    expect(optimize).toBeEnabled()
  })
})
