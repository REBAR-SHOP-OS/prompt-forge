import { useState, type ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WizardStyleOption } from '@/modules/generator-ui/lib/promptStyles'
import { StylePickerDialog } from './StylePickerDialog'

const options: WizardStyleOption[] = [
  {
    value: 'first',
    label: 'First style',
    prompt: 'first',
    posterUrl: '/first.jpg',
    videoUrl: '/first.mp4',
    group: 'Genre & atmosphere',
  },
  {
    value: 'second',
    label: 'Second style',
    prompt: 'second',
    posterUrl: '/second.jpg',
    videoUrl: '/second.mp4',
    group: 'Scene · Natural',
  },
  {
    value: 'no-media',
    label: 'No media style',
    prompt: 'no media',
    group: 'Scene · Construction',
  },
]

function renderPicker(overrides: Partial<ComponentProps<typeof StylePickerDialog>> = {}) {
  const onOpenChange = vi.fn()
  const onSelect = vi.fn()
  const onApply = vi.fn()
  render(
    <StylePickerDialog
      open
      onOpenChange={onOpenChange}
      title="Select Visual Theme"
      options={options}
      selectedValue="first"
      onSelect={onSelect}
      onApply={onApply}
      {...overrides}
    />,
  )
  return { onOpenChange, onSelect, onApply }
}

function ControlledPicker() {
  const [open, setOpen] = useState(true)
  return (
    <StylePickerDialog
      open={open}
      onOpenChange={setOpen}
      title="Select Visual Theme"
      options={options}
      selectedValue="first"
      onSelect={() => {}}
      onApply={() => {}}
    />
  )
}

describe('StylePickerDialog media previews', () => {
  it('mounts zero videos initially and lazy-loads only static posters', () => {
    renderPicker()

    expect(document.querySelectorAll('video')).toHaveLength(0)
    const posters = Array.from(document.querySelectorAll('img'))
    expect(posters).toHaveLength(2)
    for (const poster of posters) {
      expect(poster).toHaveAttribute('loading', 'lazy')
      expect(poster.getAttribute('src')).not.toContain('.mp4')
    }
  })

  it('mounts one video only after Preview and replaces the previous preview', () => {
    renderPicker()

    fireEvent.click(screen.getByRole('button', { name: 'Preview First style' }))
    expect(document.querySelectorAll('video')).toHaveLength(1)
    expect(screen.getByLabelText('First style video preview').getAttribute('src')).toMatch(/\/first\.mp4$/)

    fireEvent.click(screen.getByRole('button', { name: 'Preview Second style' }))
    expect(document.querySelectorAll('video')).toHaveLength(1)
    expect(screen.queryByLabelText('First style video preview')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Second style video preview').getAttribute('src')).toMatch(/\/second\.mp4$/)
  })

  it('unmounts the video on preview Close, option change, tab change and dialog close', () => {
    const { onOpenChange } = renderPicker()

    fireEvent.click(screen.getByRole('button', { name: 'Preview First style' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close First style preview' }))
    expect(document.querySelector('video')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Preview First style' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Second style' }))
    expect(document.querySelector('video')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Preview First style' }))
    fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
    expect(document.querySelector('video')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('unmounts the active video when Escape closes the controlled dialog', () => {
    render(<ControlledPicker />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview First style' }))
    expect(document.querySelector('video')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('video')).not.toBeInTheDocument()
  })

  it('uses React fallbacks for poster/video errors and for options without media', () => {
    renderPicker()

    const firstCard = screen.getByRole('button', { name: 'Select First style' })
    const firstPoster = firstCard.querySelector('img')
    expect(firstPoster).not.toBeNull()
    fireEvent.error(firstPoster!)
    expect(screen.getByTestId('media-fallback-first')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Preview Second style' }))
    fireEvent.error(screen.getByLabelText('Second style video preview'))
    expect(document.querySelector('video')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Second style' })).toBeInTheDocument()

    expect(screen.getByTestId('media-fallback-no-media')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preview No media style' })).not.toBeInTheDocument()
  })

  it('keeps Preview separate from selection and applies the pending selection', () => {
    const { onSelect, onApply } = renderPicker()

    fireEvent.click(screen.getByRole('button', { name: 'Preview Second style' }))
    expect(screen.getByRole('button', { name: 'Select First style' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Select Second style' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Select Second style' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onSelect).toHaveBeenCalledWith('second')
    expect(onApply).toHaveBeenCalledOnce()
  })
})
