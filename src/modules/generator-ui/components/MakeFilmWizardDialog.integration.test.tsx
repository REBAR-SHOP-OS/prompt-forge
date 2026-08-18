import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MakeFilmWizardDialog, {
  type IdentityRef,
  type IdentitySnapshot,
} from './MakeFilmWizardDialog'

// Mock the supabase client so the wizard's storage/query calls are fully
// controlled. This exercises the real data path (selection -> snapshot ->
// generateSceneImage payload -> Approve) without any network. vi.hoisted is
// required because vi.mock factories are hoisted above top-level variables.
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

// A controllable generateSceneImage spy that records the exact payload the
// wizard passes (urls + characterSheet flag) for both initial and Regenerate.
const generateSceneImage = vi.fn(async () => 'data:image/png;base64,SCENE')

const writeScenario = vi.fn(async () => ['Scene one', 'Scene two'])

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

const defaultProduct: MockPhotoRow = {
  id: 'product-1',
  title: 'Test product',
  image_type: null,
}

// Mock both product and character queries while preserving their different
// Supabase builder chains.
function mockImageRows(
  products: MockPhotoRow[] = [defaultProduct],
  characters: MockPhotoRow[] = [],
) {
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
      return {
        select: vi.fn(() => builder),
      }
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

function mockCharacterRows(rows: MockPhotoRow[]) {
  mockImageRows([defaultProduct], rows)
}

async function chooseProduct(title = 'Test product') {
  fireEvent.click(screen.getByText('Choose product'))
  await waitFor(() => expect(screen.getByText(title)).toBeInTheDocument())
  fireEvent.click(screen.getByText(title))
function mockRefreshableCharacterRows(
  initialRows: Array<{ id: string; title: string | null; image_type: string | null }>,
) {
  let rows = [...initialRows]
  const order = vi.fn(async () => ({
    data: rows.map((r) => ({
      id: r.id,
      storage_path: `https://x.supabase.co/user-1/${r.id}.png`,
      created_at: '2026-08-18T12:00:00Z',
      title: r.title,
      category: 'character',
      image_type: r.image_type,
    })),
    error: null,
  }))
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.is = vi.fn(() => query)
  query.order = order
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'generator_user_images') throw new Error(`Unexpected table: ${table}`)
    return query
  })
  return {
    addRow(row: { id: string; title: string | null; image_type: string | null }) {
      rows = [row, ...rows]
    },
    order,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  generateSceneImage.mockResolvedValue('data:image/png;base64,SCENE')
  writeScenario.mockResolvedValue(['Scene one', 'Scene two'])
  onApprove.mockClear()
  mockInvoke.mockReset()
  mockImageRows()
})

describe('MakeFilmWizardDialog scenario product requirement (integration)', () => {
  it('requires a product, enables after selection, and disables immediately after removal', async () => {
    renderWizard()
    const writeButton = screen.getByRole('button', { name: 'Write scenario' })

    expect(writeButton).toBeDisabled()
    await chooseProduct()
    expect(writeButton).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Remove product' }))
    expect(writeButton).toBeDisabled()
  }, 10_000)

  it('guards the handler so writeScenario cannot run without a product', () => {
    renderWizard()
    const writeButton = screen.getByRole('button', { name: 'Write scenario' })

    fireEvent.click(writeButton)

    expect(writeScenario).not.toHaveBeenCalled()
  })
})

describe('MakeFilmWizardDialog identity data path (integration)', () => {
  it('opens the existing sheet flow from a plain character without selecting the card, then refreshes the picker', async () => {
    const rows = mockRefreshableCharacterRows([
      { id: 'sheet-1', title: 'Existing sheet', image_type: 'character_sheet' },
      { id: 'plain-1', title: 'Sarah', image_type: 'character' },
    ])
    mockInvoke.mockImplementation(async (functionName: string) => {
      expect(functionName).toBe('generate-character-sheet')
      rows.addRow({ id: 'sheet-2', title: 'Sarah — sheet', image_type: 'character_sheet' })
      return {
        data: {
          id: 'sheet-2',
          storage_path: 'https://x.supabase.co/storage/v1/object/public/user-images/user-1/character-sheet-2.png',
          title: 'Sarah — sheet',
        },
        error: null,
      }
    })
    renderWizard()

    fireEvent.click(screen.getByText('Choose character'))
    await waitFor(() => expect(screen.getByText('Sarah')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Create character sheet for Existing sheet' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create character sheet for Sarah' }))

    expect(screen.getByText('Source character')).toBeInTheDocument()
    expect(screen.getAllByText('Sarah').length).toBeGreaterThan(0)
    expect(screen.getByText('Choose character')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Create character sheet' }))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('generate-character-sheet', {
      body: {
        imageUrl: expect.stringContaining('plain-1'),
        model: 'fast',
        title: 'Sarah',
      },
    }))
    await waitFor(() => expect(screen.getByText('Sarah — sheet')).toBeInTheDocument())
    expect(rows.order.mock.calls.length).toBeGreaterThanOrEqual(3)

    fireEvent.click(screen.getByText('Sarah — sheet'))
    await waitFor(() => expect(screen.queryByText('Choose a character')).not.toBeInTheDocument())
    expect(screen.getByText('Sarah — sheet')).toBeInTheDocument()
  }, 10_000)

  it('shows a readable sheet error and allows retry without duplicate in-flight clicks', async () => {
    const rows = mockRefreshableCharacterRows([
      { id: 'plain-1', title: 'Sarah', image_type: 'character' },
    ])
    let resolveFirst: ((value: { data: null; error: Error }) => void) | undefined
    mockInvoke
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve
      }))
      .mockImplementationOnce(async () => {
        rows.addRow({ id: 'sheet-2', title: 'Sarah — sheet', image_type: 'character_sheet' })
        return {
          data: {
            id: 'sheet-2',
            storage_path: 'https://x.supabase.co/storage/v1/object/public/user-images/user-1/character-sheet-2.png',
            title: 'Sarah — sheet',
          },
          error: null,
        }
      })
    renderWizard()

    fireEvent.click(screen.getByText('Choose character'))
    await waitFor(() => expect(screen.getByText('Sarah')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Create character sheet for Sarah' }))

    const createButton = screen.getByRole('button', { name: 'Create character sheet' })
    fireEvent.click(createButton)
    expect(createButton).toBeDisabled()
    fireEvent.click(createButton)
    expect(mockInvoke).toHaveBeenCalledTimes(1)

    resolveFirst?.({ data: null, error: new Error('Rate limit reached. Try again in a moment.') })
    await waitFor(() => expect(screen.getByText(/Could not create the character sheet: Rate limit reached/i)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByText('Sarah — sheet')).toBeInTheDocument())
  })

  it('freezes the selection into a snapshot and passes url + characterSheet to initial generation', async () => {
    mockCharacterRows([
      { id: 'sheet-1', title: 'My custom sheet', image_type: 'character_sheet' },
      { id: 'plain-1', title: 'Sarah', image_type: 'character' },
    ])
    renderWizard()

    // Open the character picker and choose the sheet.
    fireEvent.click(screen.getByText('Choose character'))
    await waitFor(() => expect(screen.getByText('My custom sheet')).toBeInTheDocument())
    fireEvent.click(screen.getByText('My custom sheet'))

    // Write the scenario.
    await chooseProduct()
    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(screen.getByText('Scene one')).toBeInTheDocument())

    // Generate preview images.
    fireEvent.click(screen.getByText('Generate preview images'))
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())

    // The initial generation must receive the required product plus the sheet
    // URL and characterSheet=true.
    const calls = generateSceneImage.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      expect(c[2]).toContain('product-1')
      expect(c[3]).toContain('sheet-1') // character url from snapshot
      expect(c[6]).toBe(true) // characterSheet flag from snapshot
    }
  })

  it('Regenerate consumes the frozen snapshot (url + characterSheet), not the current selection', async () => {
    mockCharacterRows([
      { id: 'sheet-1', title: 'My custom sheet', image_type: 'character_sheet' },
      { id: 'plain-1', title: 'Sarah', image_type: 'character' },
    ])
    renderWizard()

    // Choose the sheet, write scenario, generate.
    fireEvent.click(screen.getByText('Choose character'))
    await waitFor(() => expect(screen.getByText('My custom sheet')).toBeInTheDocument())
    fireEvent.click(screen.getByText('My custom sheet'))
    await chooseProduct()
    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(screen.getByText('Scene one')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Generate preview images'))
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())
    generateSceneImage.mockClear()

    // Regenerate scene 0 directly from the images step. Regenerate must use the
    // frozen snapshot (sheet-1, sheet=true) that was captured at generation
    // start — the same identity that was previewed.
    const regenButtons = screen.getAllByText('Regenerate')
    fireEvent.click(regenButtons[0])
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())

    const c = generateSceneImage.mock.calls[0]
    expect(c[3]).toContain('sheet-1')
    expect(c[6]).toBe(true)
  })

  it('Approve passes the frozen snapshot identity (url + name) from the generation run', async () => {
    mockCharacterRows([
      { id: 'sheet-1', title: 'My custom sheet', image_type: 'character_sheet' },
      { id: 'plain-1', title: 'Sarah', image_type: 'character' },
    ])
    renderWizard()

    fireEvent.click(screen.getByText('Choose character'))
    await waitFor(() => expect(screen.getByText('My custom sheet')).toBeInTheDocument())
    fireEvent.click(screen.getByText('My custom sheet'))
    await chooseProduct()
    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(screen.getByText('Scene one')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Generate preview images'))
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())

    // Approve directly from the images step. The approved identity must be the
    // frozen snapshot (the sheet), matching what was previewed.
    fireEvent.click(screen.getByText(/Approve & Make Film/i))
    await waitFor(() => expect(onApprove).toHaveBeenCalled())

    const identity = onApprove.mock.calls[0][2].identity
    expect(identity.characterUrl).toContain('sheet-1')
    expect(identity.characterName).toBe('My custom sheet')
  })

  it('a plain character (image_type=character) is never treated as a sheet', async () => {
    mockCharacterRows([
      { id: 'plain-1', title: 'Sarah', image_type: 'character' },
    ])
    renderWizard()

    fireEvent.click(screen.getByText('Choose character'))
    await waitFor(() => expect(screen.getByText('Sarah')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Sarah'))
    await chooseProduct()
    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(screen.getByText('Scene one')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Generate preview images'))
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())

    for (const c of generateSceneImage.mock.calls) {
      expect(c[6]).toBe(false) // plain character -> not a sheet
    }
  })
})

describe('MakeFilmWizardDialog full style dataset (integration)', () => {
  // The camera/theme selectors are buttons that open the StylePickerDialog.
  // Select an option inside the dialog, then confirm with Apply.
  const openCameraPicker = () => fireEvent.click(screen.getByLabelText(/^Camera angle:/))
  const openThemePicker = () => fireEvent.click(screen.getByLabelText(/^Visual theme:/))
  const applyPicker = () => fireEvent.click(screen.getByText('Apply'))

  it('shows all camera styles and all theme subgroups in the picker dialogs', async () => {
    renderWizard()

    // Camera angle picker lists every shared camera style.
    openCameraPicker()
    await waitFor(() => expect(screen.getByText('Whip Pan')).toBeInTheDocument())
    expect(screen.getByText('Orbit Shot')).toBeInTheDocument()
    expect(screen.getByText('FPV Drone')).toBeInTheDocument()
    expect(screen.getByText('Parallax Motion')).toBeInTheDocument()
    // Close the camera picker.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    // Visual theme picker shows the subgroup headers (Genre / Scene / Template).
    openThemePicker()
    await waitFor(() => expect(screen.getByText('Genre & atmosphere')).toBeInTheDocument())
    expect(screen.getByText('Scene · Construction & Civil Works')).toBeInTheDocument()
    expect(screen.getByText('Scene · Industrial & Construction')).toBeInTheDocument()
    expect(screen.getByText('Template · Corporate & Business')).toBeInTheDocument()
    // A Construction & Civil Works scene is present (not dropped by group order).
    expect(screen.getByText('Rebar & Reinforcement Site')).toBeInTheDocument()
  })

  it('propagates the selected camera and theme into the scenario and image prompts', async () => {
    renderWizard()

    // Select a camera style.
    openCameraPicker()
    await waitFor(() => expect(screen.getByText('Whip Pan')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Whip Pan'))
    applyPicker()

    // Select a theme (a Construction & Civil Works scene).
    openThemePicker()
    await waitFor(() => expect(screen.getByText('Rebar & Reinforcement Site')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Rebar & Reinforcement Site'))
    applyPicker()

    // Write the scenario.
    await chooseProduct()
    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(writeScenario).toHaveBeenCalled())

    // The scenario prompt must carry the camera + theme directives.
    const promptArg = writeScenario.mock.calls[0][0]
    expect(promptArg).toContain('Whip pan camera move')
    expect(promptArg).toContain('Rebar and reinforcement environment')
    // The options passed to writeScenario carry the camera/theme prompts.
    const options = writeScenario.mock.calls[0][1]
    expect(options.cameraStyle).toContain('Whip pan camera move')
    expect(options.theme).toContain('Rebar and reinforcement environment')

    // Generate preview images — the creative (camera + theme) must propagate.
    fireEvent.click(screen.getByText('Generate preview images'))
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())
    const creative = generateSceneImage.mock.calls[0][5]
    expect(creative.cameraStyle).toContain('Whip pan camera move')
    expect(creative.theme).toContain('Rebar and reinforcement environment')
  })

  it('preserves the selected styles across Regenerate and Approve', async () => {
    renderWizard()

    // Select camera + theme.
    openCameraPicker()
    await waitFor(() => expect(screen.getByText('Orbit Shot')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Orbit Shot'))
    applyPicker()
    openThemePicker()
    await waitFor(() => expect(screen.getByText('Heavy Industry Factory')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Heavy Industry Factory'))
    applyPicker()

    await chooseProduct()
    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(screen.getByText('Scene one')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Generate preview images'))
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())
    generateSceneImage.mockClear()

    // Regenerate scene 0 — the creative must be preserved.
    const regenButtons = screen.getAllByText('Regenerate')
    fireEvent.click(regenButtons[0])
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())
    const regenCreative = generateSceneImage.mock.calls[0][5]
    expect(regenCreative.cameraStyle).toContain('Orbit shot')
    expect(regenCreative.theme).toContain('Heavy industry factory')

    // Approve — the creative must be preserved in the approval payload.
    fireEvent.click(screen.getByText(/Approve & Make Film/i))
    await waitFor(() => expect(onApprove).toHaveBeenCalled())
    const approveCreative = onApprove.mock.calls[0][2].creative
    expect(approveCreative.cameraStyle).toContain('Orbit shot')
    expect(approveCreative.theme).toContain('Heavy industry factory')
  })
})

describe('MakeFilmWizardDialog product name sanitization (integration)', () => {
  it('sends the sanitized product name (stirup001 -> stirup) to writeScenario', async () => {
    // Mock a product row titled "stirup001" (category product).
    mockFrom.mockImplementation((table: string) => {
      if (table === 'generator_user_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(async () => ({
                    data: [
                      { id: 'prod-1', storage_path: 'https://x/user/prod-1.png', title: 'stirup001', category: 'product', image_type: null },
                    ],
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        }
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
    renderWizard()

    // Open the product picker and choose the product.
    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('stirup001')).toBeInTheDocument())
    fireEvent.click(screen.getByText('stirup001'))

    // Write the scenario.
    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(writeScenario).toHaveBeenCalled())

    // The productName passed to writeScenario must be sanitized (no "001").
    const options = writeScenario.mock.calls[0][1]
    expect(options.productName).toBe('stirup')
    // The raw title is never sent; the sanitized name is used in the prompt too.
    expect(options.productName).not.toContain('001')
  })

  it('uses a saved user product to prefill Product Name and preserves a manual override through prompt and film identity', async () => {
    const productEq = vi.fn()
    const productQuery = {
      is: vi.fn(() => ({
        order: vi.fn(async () => ({
          data: [
            { id: 'prod-2', storage_path: 'https://x/user/prod-2.png', title: 'Saved Widget', category: 'product' },
          ],
          error: null,
        })),
      })),
    }
    productEq.mockImplementation((column: string, value: string) => {
      if (column === 'category' && value === 'product') return { eq: productEq }
      if (column === 'user_id' && value === 'user-1') return productQuery
      throw new Error(`Unexpected product filter: ${column}=${value}`)
    })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'generator_user_images') {
        return { select: vi.fn(() => ({ eq: productEq })) }
      }
      throw new Error(`Unexpected table: ${table}`)
    })
    renderWizard()

    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Saved Widget')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Saved Widget'))

    const productNameInput = screen.getByRole('textbox', { name: 'Product name' })
    expect(productNameInput).toHaveValue('Saved Widget')
    fireEvent.change(productNameInput, { target: { value: 'Manual Launch Name' } })

    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(writeScenario).toHaveBeenCalled())

    expect(productEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(writeScenario.mock.calls[0][0]).toContain('PRODUCT TO FEATURE: Manual Launch Name')
    expect(writeScenario.mock.calls[0][1].productName).toBe('Manual Launch Name')

    fireEvent.click(screen.getByText('Generate preview images'))
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())
    fireEvent.click(screen.getByText(/Approve & Make Film/i))
    await waitFor(() => expect(onApprove).toHaveBeenCalled())
    expect(onApprove.mock.calls[0][2].identity.productName).toBe('Manual Launch Name')
  })
})

describe('MakeFilmWizardDialog prompt optimization', () => {
  it('does nothing when the prompt is empty', async () => {
    renderWizard({ initialPrompt: '' })
    const button = screen.getByRole('button', { name: /optimize prompt/i })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('replaces the prompt with the enhanced text on success and allows undo', async () => {
    mockInvoke.mockResolvedValue({
      data: { enhancedPrompt: 'A polished cinematic film about a product.' },
      error: null,
    })
    renderWizard()
    const textarea = screen.getByPlaceholderText(/Describe the film/i)
    fireEvent.change(textarea, { target: { value: 'a product film' } })

    const button = screen.getByRole('button', { name: /optimize prompt/i })
    fireEvent.click(button)

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('enhance-prompt', {
      body: { prompt: 'a product film' },
    }))
    await waitFor(() => expect(textarea).toHaveValue('A polished cinematic film about a product.'))

    // Undo restores the original text.
    fireEvent.click(screen.getByText('Undo optimization'))
    await waitFor(() => expect(textarea).toHaveValue('a product film'))
  })

  it('keeps the original text and shows a readable message on error', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('Rate limit reached. Try again in a moment.') })
    renderWizard()
    const textarea = screen.getByPlaceholderText(/Describe the film/i)
    fireEvent.change(textarea, { target: { value: 'a product film' } })

    fireEvent.click(screen.getByRole('button', { name: /optimize prompt/i }))

    await waitFor(() => expect(screen.getByText(/Rate limit reached/i)).toBeInTheDocument())
    expect(textarea).toHaveValue('a product film')
    // No undo button after a failed optimization.
    expect(screen.queryByText('Undo optimization')).not.toBeInTheDocument()
  })

  it('keeps the original text when the AI returns an empty prompt', async () => {
    mockInvoke.mockResolvedValue({ data: { enhancedPrompt: '   ' }, error: null })
    renderWizard()
    const textarea = screen.getByPlaceholderText(/Describe the film/i)
    fireEvent.change(textarea, { target: { value: 'a product film' } })

    fireEvent.click(screen.getByRole('button', { name: /optimize prompt/i }))

    await waitFor(() => expect(screen.getByText(/empty prompt/i)).toBeInTheDocument())
    expect(textarea).toHaveValue('a product film')
  })

  it('disables the button while optimizing and ignores repeated clicks', async () => {
    let resolveInvoke: (v: unknown) => void
    mockInvoke.mockImplementation(() => new Promise((res) => { resolveInvoke = res }))
    renderWizard()
    const textarea = screen.getByPlaceholderText(/Describe the film/i)
    fireEvent.change(textarea, { target: { value: 'a product film' } })

    const button = screen.getByRole('button', { name: /optimize prompt/i })
    fireEvent.click(button)
    // While pending, the button is disabled and repeated clicks are ignored.
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(mockInvoke).toHaveBeenCalledTimes(1)

    resolveInvoke!({ data: { enhancedPrompt: 'Enhanced.' }, error: null })
    await waitFor(() => expect(textarea).toHaveValue('Enhanced.'))
  })
})
