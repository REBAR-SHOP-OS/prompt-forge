import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarInfoDialog from './CalendarInfoDialog'

const { mockInvoke, mockRequest, mockToast } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockRequest: vi.fn(),
  mockToast: vi.fn(),
}))

vi.mock('@/core/api/client', () => ({ request: mockRequest }))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mockInvoke } },
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock('@/modules/generator-ui/lib/occasions', () => {
  const occasion = {
    title: 'International Day of Peace',
    date: '2026-09-21',
    category: 'international',
    major: true,
    source: 'fixed',
  }
  return {
    getOccasionsForDate: () => [occasion],
    getOccasionsForMonth: () => [occasion],
    toDateKey: () => occasion.date,
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  mockRequest.mockResolvedValue({
    occasion: {
      whatItIs: 'A global observance dedicated to strengthening peace.',
      history: 'The United Nations established it in 1981.',
    },
  })
  mockInvoke.mockResolvedValue({ data: { enhancedPrompt: 'A peaceful cinematic scene.' }, error: null })
})

describe('CalendarInfoDialog occasion detail', () => {
  it('loads day-info through the session-recovering API client and renders About and History', async () => {
    render(
      <CalendarInfoDialog
        open
        todayOnly
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /International Day of Peace/i }))

    await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1))
    expect(mockRequest).toHaveBeenCalledWith('/day-info', {
      method: 'POST',
      body: JSON.stringify({
        occasion: {
          title: 'International Day of Peace',
          date: '2026-09-21',
          category: 'international',
        },
        lang: 'en',
      }),
    })
    expect(await screen.findByText('A global observance dedicated to strengthening peace.')).toBeInTheDocument()
    expect(screen.getByText('The United Nations established it in 1981.')).toBeInTheDocument()
  })

  it('shows the actionable session error returned by the API client', async () => {
    mockRequest.mockRejectedValueOnce(new Error('Please sign in again.'))

    render(
      <CalendarInfoDialog
        open
        todayOnly
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /International Day of Peace/i }))

    expect(await screen.findByText('Please sign in again.')).toBeInTheDocument()
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Could not load occasion detail',
      description: 'Please sign in again.',
      variant: 'destructive',
    }))
  })
})
