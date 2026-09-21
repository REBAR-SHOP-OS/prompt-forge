import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProductAdDialog from './ProductAdDialog'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}))

describe('ProductAdDialog accessibility', () => {
  it('gives the icon-only company-logo removal control an accessible name', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: {
              business_info: 'Rebar media studio',
              contact_website: null,
              contact_phone: null,
              contact_address: null,
              contact_logo_url: 'https://example.com/logo.png',
            },
            error: null,
          })),
        })),
      })),
    })

    render(
      <ProductAdDialog
        open
        onOpenChange={vi.fn()}
        defaultDuration={15}
        userId="user-1"
        onUseAsPrompt={vi.fn()}
      />,
    )

    await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('generator_business_profiles'))
    fireEvent.click(screen.getByRole('button', { name: 'About your business' }))

    expect(await screen.findByRole('button', { name: 'Remove company logo' })).toBeInTheDocument()
  })
})
