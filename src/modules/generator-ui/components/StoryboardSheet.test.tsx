import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StoryboardSheet } from './StoryboardSheet'

describe('StoryboardSheet', () => {
  const plans = [
    { scenarioText: 'Shot 1 action', shotMode: 'product' },
    { scenarioText: 'Shot 2 action', shotMode: 'product' }
  ] as unknown as import("@/modules/generator-ui/lib/makeFilmWizard").FilmPlan[]

  it('renders a grid with shot overlays, not baked into images', () => {
    render(<StoryboardSheet 
      plans={plans} 
      images={['img1.png', 'img2.png']}
      regenIndex={null}
      onRegenerate={vi.fn()}
      onEdit={vi.fn()}
      onZoom={vi.fn()}
      working={false}
      aspect="16:9"
    />)

    // The shot labels are in the DOM over the images
    expect(screen.getByText('Shot 1')).toBeInTheDocument()
    expect(screen.getByText('Shot 2')).toBeInTheDocument()
  })

  it('calls onRegenerate for a specific panel', async () => {
    const onRegenerate = vi.fn()
    
    render(<StoryboardSheet 
      plans={plans} 
      images={['img1.png', 'img2.png']}
      regenIndex={null}
      onRegenerate={onRegenerate}
      onEdit={vi.fn()}
      onZoom={vi.fn()}
      working={false}
      aspect="16:9"
    />)

    const regenButtons = screen.getAllByRole('button', { name: /Regenerate/i })
    fireEvent.click(regenButtons[0])

    expect(onRegenerate).toHaveBeenCalledWith(0)
  })
})
