import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MakeFilmWizardDialog from './MakeFilmWizardDialog'

const { mockFrom, mockStorage } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockStorage: {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(async () => ({
        data: { signedUrl: 'https://signed/product.png' },
        error: null,
      })),
    })),
  },
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: mockStorage,
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}))

const SIX_PLANS = [
  'Opening shot with product front and center.',
  'Close-up detail of product features.',
  'Product in use, medium shot.',
  'Dynamic angle showing product benefits.',
  'Character interaction with product.',
  'Final call-to-action with product logo.',
]

const writeScenario = vi.fn(async () => SIX_PLANS)
const generateSceneImage = vi.fn(async () => 'data:image/png;base64,STORYBOARD')
const onApprove = vi.fn()

function mockProductRows() {
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
          data: category === 'product'
            ? [{ id: 'product-1', storage_path: 'products/product-1.png', title: 'Test product' }]
            : [],
          error: null,
        })),
      }
      return { select: vi.fn(() => builder) }
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({ order: vi.fn(async () => ({ data: [], error: null })) })),
        })),
      })),
    }
  })
}

function renderWizard() {
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
    />,
  )
}

async function reachScenario() {
  fireEvent.click(screen.getByText('Choose product'))
  await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Test product'))
  fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), {
    target: { value: 'A film' },
  })
  fireEvent.click(screen.getByText('Write scenario'))
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Full film scenario' })).toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
  writeScenario.mockResolvedValue(SIX_PLANS)
  generateSceneImage.mockResolvedValue('data:image/png;base64,STORYBOARD')
  mockProductRows()
})

describe('Make Full Film unified scenario and storyboard', () => {
  it('shows one editable scenario and generates exactly one storyboard image', async () => {
    renderWizard()
    await reachScenario()

    const scenario = screen.getByRole('textbox', { name: 'Full film scenario' })
    expect(scenario).toHaveValue(expect.stringContaining('Opening shot'))
    expect(screen.queryByText(/Shot 1/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Generate storyboard/ }))

    await waitFor(() => expect(generateSceneImage).toHaveBeenCalledTimes(1))
    const imagePrompt = generateSceneImage.mock.calls[0][0]
    expect(imagePrompt).toContain('Create ONE cinematic storyboard contact sheet')
    expect(imagePrompt).toContain('exactly 6 equal-sized visual panels')
    expect(imagePrompt).toContain('PANEL 1:')
    expect(imagePrompt).toContain('PANEL 6:')
    expect(screen.getByAltText('Full film storyboard')).toHaveAttribute(
      'src',
      'data:image/png;base64,STORYBOARD',
    )
  })

  it('uses edits in the storyboard prompt and approval payload', async () => {
    renderWizard()
    await reachScenario()

    const edited = 'New opening. New product action. New ending.'
    fireEvent.change(screen.getByRole('textbox', { name: 'Full film scenario' }), {
      target: { value: edited },
    })
    fireEvent.click(screen.getByRole('button', { name: /Generate storyboard/ }))
    await waitFor(() => expect(screen.getByAltText('Full film storyboard')).toBeInTheDocument())

    expect(generateSceneImage.mock.calls[0][0]).toContain(edited)
    fireEvent.click(screen.getByRole('button', { name: 'Approve & Make Film' }))

    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1))
    const [scenes, images, options] = onApprove.mock.calls[0]
    expect(scenes).toHaveLength(6)
    expect(images).toEqual(new Array(6).fill(undefined))
    expect(options).toMatchObject({
      duration: 30,
      isPlanBased: true,
      scenarioText: edited,
      storyboard: {
        sheetUrl: 'data:image/png;base64,STORYBOARD',
        scenes,
        shotImageUrls: [],
      },
    })
  })

  it('regenerates only the single storyboard sheet', async () => {
    generateSceneImage
      .mockResolvedValueOnce('data:image/png;base64,FIRST')
      .mockResolvedValueOnce('data:image/png;base64,SECOND')
    renderWizard()
    await reachScenario()
    fireEvent.click(screen.getByRole('button', { name: /Generate storyboard/ }))
    await waitFor(() => expect(screen.getByAltText('Full film storyboard')).toHaveAttribute('src', 'data:image/png;base64,FIRST'))

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    await waitFor(() => expect(generateSceneImage).toHaveBeenCalledTimes(2))
    expect(screen.getByAltText('Full film storyboard')).toHaveAttribute('src', 'data:image/png;base64,SECOND')
  })
})
