import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DraggablePreview } from './DraggablePreview'
import type { PreviewPosition } from '@/modules/generator-ui/hooks/usePreviewPosition'

function makePosition(overrides: Partial<PreviewPosition> = {}): PreviewPosition {
  return {
    offset: { x: 0, y: 0 },
    dragging: false,
    disabled: false,
    onHandlePointerDown: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  }
}

describe('DraggablePreview', () => {
  it('renders a drag handle and a reset button on desktop', () => {
    const position = makePosition()
    render(
      <DraggablePreview position={position} frameRef={{ current: null }}>
        <div>preview content</div>
      </DraggablePreview>,
    )
    expect(screen.getByRole('button', { name: 'Drag preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset preview position' })).toBeInTheDocument()
    expect(screen.getByText('preview content')).toBeInTheDocument()
  })

  it('starts a drag only from the handle', () => {
    const onHandlePointerDown = vi.fn()
    const position = makePosition({ onHandlePointerDown })
    render(
      <DraggablePreview position={position} frameRef={{ current: null }}>
        <div>preview content</div>
      </DraggablePreview>,
    )
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag preview' }))
    expect(onHandlePointerDown).toHaveBeenCalledTimes(1)
  })

  it('calls reset when the reset button is clicked', () => {
    const reset = vi.fn()
    const position = makePosition({ reset })
    render(
      <DraggablePreview position={position} frameRef={{ current: null }}>
        <div>preview content</div>
      </DraggablePreview>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset preview position' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('hides the handle and reset button when dragging is disabled (mobile)', () => {
    const position = makePosition({ disabled: true })
    render(
      <DraggablePreview position={position} frameRef={{ current: null }}>
        <div>preview content</div>
      </DraggablePreview>,
    )
    expect(screen.queryByRole('button', { name: 'Drag preview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset preview position' })).not.toBeInTheDocument()
    expect(screen.getByText('preview content')).toBeInTheDocument()
  })

  it('applies the translate offset to the frame', () => {
    const position = makePosition({ offset: { x: 30, y: -15 } })
    const { container } = render(
      <DraggablePreview position={position} frameRef={{ current: null }}>
        <div>preview content</div>
      </DraggablePreview>,
    )
    const frame = container.firstElementChild as HTMLElement
    expect(frame.style.transform).toBe('translate(30px, -15px)')
  })
})
