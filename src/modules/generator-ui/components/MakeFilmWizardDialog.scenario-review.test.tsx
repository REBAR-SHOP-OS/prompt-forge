import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import MakeFilmWizardDialog from './MakeFilmWizardDialog'

// Mock the supabase client so the review dialog's translate-text calls are
// fully controlled. vi.hoisted is required because vi.mock factories are
// hoisted above top-level variables.
const { mockFrom, mockStorage, mockInvoke } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  const mockStorage = {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed/1.png' }, error: null })),
    })),
  }
  const mockInvoke = vi.fn()
  return { mockFrom, mockStorage, mockInvoke }
})
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: mockStorage,
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}))

const generateSceneImage = vi.fn(async () => 'data:image/png;base64,SCENE')
const writeScenario = vi.fn(async () => [
  '**Visuals:** Opening shot with product front and center. ===SCENE=== **Visuals:** Close-up detail of product features. ===SCENE=== **Narration:** "Buy now." ===SCENE=== Dynamic angle showing product benefits. ===SCENE=== Character interaction with product. ===SCENE=== Final call-to-action with product logo.',
])
const onApprove = vi.fn()

function renderWizard(overrides: Partial<Parameters<typeof MakeFilmWizardDialog>[0]> = {}) {
  return render(
    <MakeFilmWizardDialog
      open
      onOpenChange={vi.fn()}
      initialPrompt="A product film"
      defaultDuration={30}
      defaultAspect="16:9"
      userId="user-1"
      writeScenario={writeScenario}
      generateSceneImage={generateSceneImage}
      onApprove={onApprove}
      {...overrides}
    />,
  )
}

type MockPhotoRow = { id: string; title: string | null; image_type: string | null }

function mockImageRows(products: MockPhotoRow[] = [{ id: 'product-1', title: 'Test product', image_type: null }]) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'generator_user_images') {
      let category: string | undefined
      const builder = {
        eq: vi.fn((column: string, value: string) => {
          if (column === 'category') category = value
          return builder
        }),
        is: vi.fn(() => builder),
        order: vi.fn(async () => ({
          data: (category === 'product' ? products : []).map((r) => ({
            id: r.id,
            storage_path: `https://x/user/${r.id}.png`,
            title: r.title,
            category: category ?? 'character',
            image_type: r.image_type,
          })),
          error: null,
        })),
      }
      return { select: vi.fn(() => builder) }
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            order: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
    }
  })
}

async function chooseProduct(title = 'Test product') {
  fireEvent.click(screen.getByText('Choose product'))
  await waitFor(() => expect(screen.getByText(title)).toBeInTheDocument())
  fireEvent.click(screen.getByText(title))
}

async function openReview() {
  await chooseProduct()
  fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
  fireEvent.click(screen.getByText('Write scenario'))
  await waitFor(() => expect(screen.getByText(/Shot 1/)).toBeInTheDocument())
  fireEvent.click(screen.getByLabelText('Review full scenario'))
  await waitFor(() => expect(screen.getByText('Scenario Review')).toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
  generateSceneImage.mockResolvedValue('data:image/png;base64,SCENE')
  writeScenario.mockResolvedValue([
    '**Visuals:** Opening shot with product front and center. ===SCENE=== **Visuals:** Close-up detail of product features. ===SCENE=== **Narration:** "Buy now." ===SCENE=== Dynamic angle showing product benefits. ===SCENE=== Character interaction with product. ===SCENE=== Final call-to-action with product logo.',
  ])
  onApprove.mockClear()
  mockInvoke.mockReset()
  mockImageRows()
})

describe('MakeFilmWizardDialog Scenario Review (integration)', () => {
  it('shows the unified English scenario with SHOT boundaries and no raw markdown', async () => {
    renderWizard()
    await openReview()

    const body = screen.getByTestId('scenario-review-body')

    // The unified block is present with SHOT boundaries.
    expect(body).toHaveTextContent(/SHOT 1 \(0–5s\)/)
    expect(body).toHaveTextContent(/SHOT 2 \(5–10s\)/)

    // Raw markdown is stripped.
    expect(body).not.toHaveTextContent(/\*\*Visuals:\*\*/)
    expect(body).toHaveTextContent(/Visuals: Opening shot/)

    // English is the default: no translate-text call for the scenario body.
    expect(mockInvoke).not.toHaveBeenCalledWith('translate-text', expect.anything())
  }, 15_000)

  it('offers the required language menu', async () => {
    renderWizard()
    await openReview()

    const select = screen.getByLabelText('Translate scenario')
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    for (const c of ['en', 'fa', 'ar', 'tr', 'es', 'fr', 'de', 'ru', 'zh']) {
      expect(options).toContain(c)
    }
  })

  it('translates the whole scenario into Persian and applies RTL', async () => {
    mockInvoke.mockResolvedValue({ data: { translation: 'سناریوی ترجمه‌شده' }, error: null })
    renderWizard()
    await openReview()

    fireEvent.change(screen.getByLabelText('Translate scenario'), { target: { value: 'fa' } })

    await waitFor(() => expect(screen.getByText('سناریوی ترجمه‌شده')).toBeInTheDocument())
    expect(mockInvoke).toHaveBeenCalledWith('translate-text', expect.objectContaining({
      body: expect.objectContaining({ targetLang: 'fa' }),
    }))
  })

  it('shows an error and retry on translation failure, falling back to English', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Rate limit reached. Try again in a moment.') })
    renderWizard()
    await openReview()

    fireEvent.change(screen.getByLabelText('Translate scenario'), { target: { value: 'fr' } })

    await waitFor(() => expect(screen.getByText(/Rate limit reached/i)).toBeInTheDocument())
    // English unified scenario is still visible.
    expect(screen.getByTestId('scenario-review-body')).toHaveTextContent(/SHOT 1 \(0–5s\)/)
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('chunks a long scenario and reassembles the translation in order', async () => {
    // A scenario longer than 5000 chars must be split on shot boundaries.
    const longShot = 'x'.repeat(3000)
    writeScenario.mockResolvedValue([
      longShot, longShot, longShot, longShot, longShot, longShot,
    ])
    mockInvoke.mockImplementation(async (_fn: string, opts: { body: { text: string; targetLang: string } }) => {
      return { data: { translation: `[${opts.body.targetLang}]${opts.body.text.slice(0, 10)}` }, error: null }
    })
    renderWizard()
    await openReview()

    fireEvent.change(screen.getByLabelText('Translate scenario'), { target: { value: 'de' } })

    // Multiple chunks -> multiple translate-text calls, all for German.
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())
    const calls = mockInvoke.mock.calls.filter((c) => c[0] === 'translate-text')
    expect(calls.length).toBeGreaterThan(1)
    for (const c of calls) {
      expect(c[1].body.targetLang).toBe('de')
    }
  })

  it('shows a non-Latin product name in English without changing stored data', async () => {
    mockImageRows([{ id: 'product-1', title: 'میلگرد', image_type: null }])
    mockInvoke.mockResolvedValue({ data: { translation: 'Rebar' }, error: null })
    renderWizard()
    await chooseProduct('میلگرد')
    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(screen.getByText(/Shot 1/)).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Review full scenario'))
    await waitFor(() => expect(screen.getByText('Scenario Review')).toBeInTheDocument())

    await waitFor(() => expect(screen.getByText('Rebar')).toBeInTheDocument())
    // The stored product name is untouched (still the Persian value in state).
    expect(mockInvoke).toHaveBeenCalledWith('translate-text', expect.objectContaining({
      body: expect.objectContaining({ text: 'میلگرد', targetLang: 'en' }),
    }))
  })
})
