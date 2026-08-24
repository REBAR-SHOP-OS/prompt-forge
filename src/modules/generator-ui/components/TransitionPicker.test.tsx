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
