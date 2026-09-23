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
    major: false,
    source: 'fixed',
  }
  return {
    getOccasionsForDate: () => [occasion],
    getOccasionsForMonth: () => [occasion],
    toDateKey: () => '2026-09-21',
  }
})

const originalAbout = 'A global observance dedicated to strengthening peace.'
const originalHistory = 'The United Nations established it in 1981.'
const translations: Record<string, string> = {
  'International Day of Peace': 'روز جهانی صلح',
  About: 'درباره',
  [originalAbout]: 'مناسبتی جهانی برای تقویت صلح.',
  History: 'تاریخچه',
  [originalHistory]: 'سازمان ملل آن را در سال ۱۹۸۱ بنیان گذاشت.',
}

function renderDialog() {
  return render(<CalendarInfoDialog open todayOnly onOpenChange={vi.fn()} />)
}

async function openOccasion() {
  fireEvent.click(screen.getByRole('button', { name: /International Day of Peace/i }))
  expect(await screen.findByText(originalAbout)).toBeInTheDocument()
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequest.mockResolvedValue({
    occasion: { whatItIs: originalAbout, history: originalHistory },
  })
  mockInvoke.mockImplementation(async (functionName: string, options: { body: { text?: string } }) => {
    if (functionName === 'enhance-prompt') {
      return { data: { enhancedPrompt: 'A peaceful cinematic scene.' }, error: null }
    }
    const text = options.body.text ?? ''
    return { data: { translation: translations[text] ?? `translated:${text}` }, error: null }
  })
})

describe('CalendarInfoDialog translation', () => {
  it('shows an obvious language control beside the selected date', () => {
    renderDialog()

    const control = screen.getByLabelText('Translate occasion details')
    expect(control).toBeVisible()
    expect(control.closest('div')?.parentElement).toHaveTextContent(/\w+day, \w+ \d{1,2}, \d{4}/)
    expect(Array.from(control.querySelectorAll('option')).map((option) => option.value)).toEqual(
      expect.arrayContaining(['en', 'fa', 'ar', 'tr', 'es', 'fr', 'de', 'ru', 'zh']),
    )
  })

  it('translates the selected title, section labels, and bodies and renders RTL', async () => {
    renderDialog()
    await openOccasion()

    fireEvent.change(screen.getByLabelText('Translate occasion details'), { target: { value: 'fa' } })

    expect(await screen.findByText('روز جهانی صلح')).toBeInTheDocument()
    expect(screen.getByText('درباره')).toBeInTheDocument()
    expect(screen.getByText('مناسبتی جهانی برای تقویت صلح.')).toBeInTheDocument()
    expect(screen.getByText('تاریخچه')).toBeInTheDocument()
    expect(screen.getByText('سازمان ملل آن را در سال ۱۹۸۱ بنیان گذاشت.')).toBeInTheDocument()
    expect(screen.queryByText('About')).not.toBeInTheDocument()
    expect(screen.queryByText('History')).not.toBeInTheDocument()
    expect(screen.getByTestId('occasion-detail-body')).toHaveAttribute('dir', 'rtl')
    expect(document.documentElement.lang).toBe('fa')

    const translationCalls = mockInvoke.mock.calls.filter(([name]) => name === 'translate-text')
    expect(translationCalls).toHaveLength(5)
    for (const text of ['International Day of Peace', 'About', originalAbout, 'History', originalHistory]) {
      expect(mockInvoke).toHaveBeenCalledWith('translate-text', {
        body: { text, targetLang: 'fa' },
      })
    }
  })

  it('returns instantly to original English without another translation call', async () => {
    renderDialog()
    await openOccasion()
    const control = screen.getByLabelText('Translate occasion details')

    fireEvent.change(control, { target: { value: 'fa' } })
    expect(await screen.findByText('روز جهانی صلح')).toBeInTheDocument()
    const callsBeforeEnglish = mockInvoke.mock.calls.filter(([name]) => name === 'translate-text').length

    fireEvent.change(control, { target: { value: 'en' } })

    expect(screen.getAllByText('International Day of Peace').length).toBeGreaterThan(0)
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText(originalAbout)).toBeInTheDocument()
    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByText(originalHistory)).toBeInTheDocument()
    expect(screen.queryByText('درباره')).not.toBeInTheDocument()
    expect(screen.queryByText('تاریخچه')).not.toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    expect(mockInvoke.mock.calls.filter(([name]) => name === 'translate-text')).toHaveLength(callsBeforeEnglish)
  })

  it('keeps original content and announces an accessible error when translation fails', async () => {
    mockInvoke.mockImplementation(async (functionName: string) => {
      if (functionName === 'enhance-prompt') {
        return { data: { enhancedPrompt: 'A peaceful cinematic scene.' }, error: null }
      }
      return { data: null, error: new Error('Translation service unavailable') }
    })
    renderDialog()
    await openOccasion()

    fireEvent.change(screen.getByLabelText('Translate occasion details'), { target: { value: 'fr' } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/Translation service unavailable.*original English/i)
    expect(screen.getAllByText('International Day of Peace').length).toBeGreaterThan(0)
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText(originalAbout)).toBeInTheDocument()
    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByText(originalHistory)).toBeInTheDocument()
  })
})
