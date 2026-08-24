import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import MakeFilmWizardDialog from './MakeFilmWizardDialog'

// Mock the supabase client so the wizard's storage/query calls are fully
// controlled. This exercises the real data path without any network.
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

// For a 30s film, expectedPlanCount returns 6 plans.
const SIX_PLANS = [
  'Plan one: Opening shot with product front and center. ===SCENE=== Plan two: Close-up detail of product features. ===SCENE=== Plan three: Product in use, medium shot. ===SCENE=== Plan four: Dynamic angle showing product benefits. ===SCENE=== Plan five: Character interaction with product. ===SCENE=== Plan six: Final call-to-action with product logo.',
]

const writeScenario = vi.fn(
  async (_prompt: string, _options?: { duration?: number; unit?: string; productName?: string | null }) => SIX_PLANS,
)
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

const defaultProduct: MockPhotoRow = { id: 'product-1', title: 'Test product', image_type: null }

function mockImageRows(products: MockPhotoRow[] = [defaultProduct], characters: MockPhotoRow[] = []) {
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
          data: (category === 'product' ? products : characters).map((r) => ({
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

async function writeInitialScenario() {
  await chooseProduct()
  fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
  fireEvent.click(screen.getByText('Write scenario'))
  await waitFor(() => expect(screen.getByText(/Shot 1/)).toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
  generateSceneImage.mockResolvedValue('data:image/png;base64,SCENE')
  writeScenario.mockResolvedValue(SIX_PLANS)
  onApprove.mockClear()
  mockInvoke.mockReset()
  mockImageRows()
})

describe('MakeFilmWizardDialog Regenerate full scenario', () => {
  it('renders the Regenerate button with tooltip and aria-label in Step 2', async () => {
    renderWizard()
    await writeInitialScenario()

    const button = screen.getByRole('button', { name: 'Regenerate full scenario' })
    expect(button).toBeInTheDocument()
    // The Eye (Review full scenario) button is still present and distinct.
    expect(screen.getByRole('button', { name: 'Review full scenario' })).toBeInTheDocument()
  })

  it('regenerates the whole scenario preserving full context and requests a variation', async () => {
    renderWizard()
    await writeInitialScenario()
    writeScenario.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate full scenario' }))
    await waitFor(() => expect(writeScenario).toHaveBeenCalledTimes(1))

    const promptArg = writeScenario.mock.calls[0][0]
    const options = writeScenario.mock.calls[0][1]!

    // Full context preserved.
    expect(promptArg).toContain('PRODUCT TO FEATURE')
    expect(promptArg).toContain('Test product')
    expect(promptArg).toContain('30-second film')
    expect(promptArg).toContain('6 sequential 5-second plans')
    // Explicit variation request.
    expect(promptArg).toContain('VARIATION REQUEST')
    expect(promptArg).toContain('Do not repeat the previous wording')

    // Options carry duration + plan unit.
    expect(options.duration).toBe(30)
    expect(options.unit).toBe('plan')
    expect(options.productName).toBe('Test product')
  })

  it('keeps the plan count per duration / 5 rule', async () => {
    renderWizard()
    await writeInitialScenario()
    writeScenario.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate full scenario' }))
    await waitFor(() => expect(writeScenario).toHaveBeenCalledTimes(1))

    // 30s -> 6 plans; the wizard still shows 6 shots after regeneration.
    await waitFor(() => expect(screen.getAllByText(/Shot \d/).length).toBe(6))
  })

  it('preserves plan boundaries when the backend returns 6 separate plans (one with embedded newlines)', async () => {
    // The real scenario-write backend returns an ARRAY of 6 plan strings. A plan
    // whose text contains its own newlines (e.g. an embedded narration line)
    // must survive regeneration intact — re-joining the array and re-parsing it
    // collapses those boundaries and throws "1 plan section ... 6 required".
    const sixSeparatePlans = [
      'Plan one: opening shot.\nNarration: "Welcome to the film."',
      'Plan two: close-up detail.',
      'Plan three: product in use.',
      'Plan four: dynamic angle.',
      'Plan five: character interaction.',
      'Plan six: final call-to-action.',
    ]
    writeScenario.mockResolvedValue(sixSeparatePlans)
    renderWizard()
    await writeInitialScenario()
    writeScenario.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate full scenario' }))
    await waitFor(() => expect(writeScenario).toHaveBeenCalledTimes(1))

    // No error surfaced, and all 6 shots remain with the embedded narration intact.
    await waitFor(() => expect(screen.getAllByText(/Shot \d/).length).toBe(6))
    expect(screen.getByText(/Welcome to the film/)).toBeInTheDocument()
  })

  it('keeps the previous scenario intact on failure', async () => {
    renderWizard()
    await writeInitialScenario()

    // Capture the current shot text before regeneration.
    const before = screen.getAllByText(/Plan (one|two|three|four|five|six)/).map((n) => n.textContent)

    writeScenario.mockRejectedValueOnce(new Error('Rate limit reached. Try again in a moment.'))
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate full scenario' }))

    await waitFor(() => expect(screen.getByText(/Rate limit reached/i)).toBeInTheDocument())

    // Previous scenario is untouched.
    const after = screen.getAllByText(/Plan (one|two|three|four|five|six)/).map((n) => n.textContent)
    expect(after).toEqual(before)
  })

  it('resets preview images after a successful regeneration', async () => {
    renderWizard()
    await writeInitialScenario()

    // Generate preview images so there is something to reset.
    fireEvent.click(screen.getByText('Generate preview images'))
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalledTimes(6))
    expect(screen.getByAltText('Preview for scene 1')).toBeInTheDocument()

    // Go back to Step 2 and regenerate.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Regenerate full scenario' })).toBeInTheDocument())
    writeScenario.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate full scenario' }))
    await waitFor(() => expect(writeScenario).toHaveBeenCalledTimes(1))

    // Preview images are reset (no stale image remains).
    await waitFor(() => expect(screen.queryByAltText('Preview for scene 1')).not.toBeInTheDocument())
  })

  it('blocks double-click while regenerating', async () => {
    renderWizard()
    await writeInitialScenario()
    writeScenario.mockClear()

    let resolveWrite: ((v: string[]) => void) | undefined
    writeScenario.mockImplementation(() => new Promise((res) => { resolveWrite = res }))

    const button = screen.getByRole('button', { name: 'Regenerate full scenario' })
    fireEvent.click(button)
    // While pending, the button is disabled and repeated clicks are ignored.
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(writeScenario).toHaveBeenCalledTimes(1)

    resolveWrite!(SIX_PLANS)
    await waitFor(() => expect(screen.getAllByText(/Shot \d/).length).toBe(6))
  })

  it('stays on Step 2 after regeneration', async () => {
    renderWizard()
    await writeInitialScenario()
    writeScenario.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate full scenario' }))
    await waitFor(() => expect(writeScenario).toHaveBeenCalledTimes(1))

    // Still on Step 2: the Regenerate button and shot cards remain visible.
    expect(screen.getByRole('button', { name: 'Regenerate full scenario' })).toBeInTheDocument()
    expect(screen.getAllByText(/Shot \d/).length).toBe(6)
  })
})
