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

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({
    onSelect,
    onMonthChange,
  }: {
    onSelect?: (date: Date) => void
    onMonthChange?: (date: Date) => void
  }) => (
    <div>
      <button type="button" onClick={() => onSelect?.(new Date(2026, 8, 7))}>Select Labour Day</button>
      <button type="button" onClick={() => onSelect?.(new Date(2026, 8, 8))}>Select ordinary day</button>
      <button type="button" onClick={() => onMonthChange?.(new Date(2026, 9, 1))}>Next month</button>
      <button type="button" onClick={() => onMonthChange?.(new Date(2026, 8, 1))}>Previous month</button>
    </div>
  ),
}))

vi.mock('@/modules/generator-ui/lib/occasions', () => {
  const peaceDay = {
    title: 'International Day of Peace',
    date: '2026-09-21',
    category: 'international',
    major: false,
    source: 'fixed',
  }
  const labourDay = {
    title: 'Labour Day',
    date: '2026-09-07',
    category: 'canada',
    major: true,
    source: 'computed',
  }
  const toDateKey = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
  return {
    getOccasionsForDate: (date: Date) => {
      const key = toDateKey(date)
      if (key === labourDay.date) return [labourDay]
      if (key === '2026-09-08') return []
      return [peaceDay]
    },
    getOccasionsForMonth: (_year: number, month: number) => month === 9 ? [labourDay, peaceDay] : [],
    toDateKey,
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
  it('selects exact dates, keeps the dialog open, and preserves month navigation', () => {
    const onOpenChange = vi.fn()
    render(<CalendarInfoDialog open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('September 2026')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Select Labour Day' }))
    expect(screen.getByText('Monday, September 7, 2026')).toBeInTheDocument()
    expect(screen.getAllByText('Labour Day').length).toBeGreaterThan(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Select ordinary day' }))
    expect(screen.getByText('Tuesday, September 8, 2026')).toBeInTheDocument()
    expect(screen.getByText('No major holiday on this day.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('October 2026')).toBeInTheDocument()
  })

  it('loads the current occasion response and preserves About, History, and Scenario', async () => {
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
        date: '2026-09-21',
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
    expect(mockInvoke).toHaveBeenCalledWith('enhance-prompt', {
      body: expect.objectContaining({ mode: 'silent' }),
    })
    expect(await screen.findByText('A peaceful cinematic scene.')).toBeInTheDocument()
  })

  it('accepts the legacy date-mode response used by the deployed handler', async () => {
    mockRequest.mockResolvedValueOnce({
      occasions: [{
        title: 'International Day of Peace',
        whatItIs: 'Legacy About text.',
        history: 'Legacy History text.',
      }],
    })

    render(<CalendarInfoDialog open todayOnly onOpenChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /International Day of Peace/i }))

    expect(await screen.findByText('Legacy About text.')).toBeInTheDocument()
    expect(screen.getByText('Legacy History text.')).toBeInTheDocument()
    expect(mockToast).not.toHaveBeenCalled()
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
