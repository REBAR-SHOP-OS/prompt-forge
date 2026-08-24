import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TransitionPicker } from './TransitionPicker'

vi.mock('@/modules/generator-ui/components/TransitionPreview', () => ({
  TransitionPreview: ({ id }: { id: string }) => <span aria-hidden="true">{id}</span>,
}))

describe('TransitionPicker interactions', () => {
  it('uses the catalog default when changing from Cut to Fade', () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Fade/ }))

    expect(onSelect).toHaveBeenCalledWith({ id: 'fade', durationMs: 500 })
  })
})
