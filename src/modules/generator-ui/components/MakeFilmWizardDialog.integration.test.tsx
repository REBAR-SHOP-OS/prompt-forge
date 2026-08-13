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
const { mockFrom, mockStorage } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  const mockStorage = {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed/1.png' }, error: null })),
    })),
  }
  return { mockFrom, mockStorage }
})
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: mockStorage,
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

// Mock the character/product photo query to return controlled rows.
function mockCharacterRows(rows: Array<{ id: string; title: string | null; image_type: string | null }>) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'generator_user_images') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: rows.map((r) => ({
                  id: r.id,
                  storage_path: `https://x/user/${r.id}.png`,
                  title: r.title,
                  category: 'character',
                  image_type: r.image_type,
                })),
                error: null,
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
}

beforeEach(() => {
  vi.clearAllMocks()
  generateSceneImage.mockResolvedValue('data:image/png;base64,SCENE')
  writeScenario.mockResolvedValue(['Scene one', 'Scene two'])
  onApprove.mockClear()
})

describe('MakeFilmWizardDialog identity data path (integration)', () => {
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
    fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
    fireEvent.click(screen.getByText('Write scenario'))
    await waitFor(() => expect(screen.getByText('Scene one')).toBeInTheDocument())

    // Generate preview images.
    fireEvent.click(screen.getByText('Generate preview images'))
    await waitFor(() => expect(generateSceneImage).toHaveBeenCalled())

    // The initial generation must receive the sheet URL and characterSheet=true.
    const calls = generateSceneImage.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      expect(c[2]).toBeUndefined() // no product
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
  // The Radix Select triggers render as comboboxes: [0] = aspect ratio,
  // [1] = camera angle, [2] = visual theme.
  const cameraCombobox = () => screen.getAllByRole('combobox')[1]
  const themeCombobox = () => screen.getAllByRole('combobox')[2]

  it('shows all camera styles and all theme subgroups in the dropdowns', async () => {
    renderWizard()

    // Camera angle dropdown lists every shared camera style.
    fireEvent.click(cameraCombobox())
    await waitFor(() => expect(screen.getByText('Whip Pan')).toBeInTheDocument())
    expect(screen.getByText('Orbit Shot')).toBeInTheDocument()
    expect(screen.getByText('FPV Drone')).toBeInTheDocument()
    expect(screen.getByText('Parallax Motion')).toBeInTheDocument()
    // Close the camera dropdown.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    // Visual theme dropdown shows the subgroup headers (Genre / Scene / Template).
    fireEvent.click(themeCombobox())
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
    fireEvent.click(cameraCombobox())
    await waitFor(() => expect(screen.getByText('Whip Pan')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Whip Pan'))

    // Select a theme (a Construction & Civil Works scene).
    fireEvent.click(themeCombobox())
    await waitFor(() => expect(screen.getByText('Rebar & Reinforcement Site')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Rebar & Reinforcement Site'))

    // Write the scenario.
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
    fireEvent.click(cameraCombobox())
    await waitFor(() => expect(screen.getByText('Orbit Shot')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Orbit Shot'))
    fireEvent.click(themeCombobox())
    await waitFor(() => expect(screen.getByText('Heavy Industry Factory')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Heavy Industry Factory'))

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
