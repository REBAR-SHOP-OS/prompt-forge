import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TransitionSpec } from '@/modules/generator-ui/lib/mergeVideos'
import { TRANSITION_GROUPS } from '@/modules/generator-ui/lib/transitions'
import { TransitionPicker } from './TransitionPicker'

vi.mock('@/modules/generator-ui/components/TransitionPreview', () => ({
  TransitionPreview: ({ id }: { id: string }) => <span aria-hidden="true">{id}</span>,
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock)

// Regression test for the "Tooltip must be used within TooltipProvider" crash.
// TransitionPicker must render its internal Tooltip (Reset to Cut) without any
// external TooltipProvider, and the Popover must open without throwing.
describe('TransitionPicker', () => {
  function renderPicker() {
    const onSelect = vi.fn()
    const onApplyToAll = vi.fn()
    const onReset = vi.fn()
    render(
      <TransitionPicker
        value="cut"
        durationMs={0}
        gapCount={2}
        onSelect={onSelect}
        onApplyToAll={onApplyToAll}
        onReset={onReset}
      />,
    )
    return { onSelect, onApplyToAll, onReset }
  }

  it('renders without an external TooltipProvider and does not throw', () => {
    // No TooltipProvider is provided here - the component must self-contain one.
    expect(() => renderPicker()).not.toThrow()
    expect(screen.getByRole('button', { name: /Transition:/ })).toBeInTheDocument()
  })

  it('opens the Popover on trigger click without exception', () => {
    renderPicker()
    const trigger = screen.getByRole('button', { name: /Transition:/ })
    expect(() => fireEvent.click(trigger)).not.toThrow()
    // Popover content is now visible.
    expect(screen.getByText('Transition')).toBeInTheDocument()
  })

  it('renders Reset to Cut and its Tooltip without throwing', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /Transition:/ }))
    const reset = screen.getByRole('button', { name: 'Reset to Cut' })
    expect(reset).toBeInTheDocument()
    // Hovering the trigger must not throw the TooltipProvider error.
    expect(() => fireEvent.mouseOver(reset)).not.toThrow()
    expect(() => fireEvent.focus(reset)).not.toThrow()
  })

  it('calls onReset when Reset to Cut is clicked', () => {
    const { onReset } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /Transition:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Cut' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})

describe('TransitionPicker interactions', () => {
  const effects = TRANSITION_GROUPS.flatMap((group) => group.items).filter((item) => item.id !== 'cut')

  it.each(effects)('uses the $label catalog default when changing from Cut', (effect) => {
    const onSelect = vi.fn()
    render(
      <TooltipProvider>
        <TransitionPicker
          value="cut"
          durationMs={0}
          gapCount={1}
          onSelect={onSelect}
          onApplyToAll={vi.fn()}
          onReset={vi.fn()}
        />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Transition: Cut' }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(effect.label) }))

    expect(onSelect).toHaveBeenCalledWith({ id: effect.id, durationMs: effect.defaultMs })
  })

  it('shows and applies the selected catalog duration immediately', () => {
    const effect = effects[0]!
    const onApplyToAll = vi.fn()

    function ControlledPicker() {
      const [spec, setSpec] = useState<TransitionSpec>({ id: 'cut', durationMs: 0 })
      return (
        <TransitionPicker
          value={spec.id}
          durationMs={spec.durationMs}
          gapCount={3}
          onSelect={(next) => setSpec(next)}
          onApplyToAll={onApplyToAll}
          onReset={() => setSpec({ id: 'cut', durationMs: 0 })}
        />
      )
    }

    render(
      <TooltipProvider>
        <ControlledPicker />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Transition: Cut' }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(effect.label) }))

    expect(screen.getByText(`${effect.defaultMs} ms`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all (3 gaps)' }))
    expect(onApplyToAll).toHaveBeenCalledWith({
      id: effect.id,
      durationMs: effect.defaultMs,
    })
  })
})
