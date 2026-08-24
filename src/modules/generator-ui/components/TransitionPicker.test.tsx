import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TransitionPicker } from './TransitionPicker'

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
    // No TooltipProvider is provided here — the component must self-contain one.
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
