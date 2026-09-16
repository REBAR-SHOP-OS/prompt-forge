import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import MakeFilmWizardDialog from './MakeFilmWizardDialog'

// Step 1's "Generate prompt" (Sparkles) control must follow the same contract as
// the rest of Step 1: a product is REQUIRED, everything else (character, film
// type, camera angle, visual theme, narration, text mode) stays optional, and the
// prompt text itself must not be required because this control produces it.

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

const writeScenario = vi.fn(async () => ['Plan one.'])
const generateSceneImage = vi.fn(async () => 'data:image/png;base64,SCENE')

function renderWizard() {
  return render(
    <MakeFilmWizardDialog
      open
      onOpenChange={vi.fn()}
      initialPrompt=""
      defaultDuration={30}
      defaultAspect="16:9"
      userId="user-1"
      writeScenario={writeScenario}
      generateSceneImage={generateSceneImage}
      onApprove={vi.fn()}
    />,
  )
}

function mockImageRows() {
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
          data:
            category === 'product'
              ? [
                  {
                    id: 'product-1',
                    storage_path: 'https://x/user/product-1.png',
                    title: 'Test product',
                    category: 'product',
                    image_type: null,
                  },
                ]
              : [],
          error: null,
        })),
      }
      return { select: vi.fn(() => builder) }
    }
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ is: vi.fn(() => ({ order: vi.fn(async () => ({ data: [], error: null })) })) })),
      })),
    }
  })
}

async function chooseProduct() {
  fireEvent.click(screen.getByText('Choose product'))
  await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Test product'))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockReset()
  mockInvoke.mockImplementation(async (fn: string) => {
    if (fn === 'enhance-prompt') {
      return { data: { enhancedPrompt: 'A generated film idea about the product.' }, error: null }
    }
    return { data: null, error: null }
  })
  mockImageRows()
})

describe('MakeFilmWizardDialog Step 1 Generate prompt gate', () => {
  it('is disabled with no product selected and clicking starts no generation', async () => {
    renderWizard()
    const button = screen.getByRole('button', { name: 'Generate prompt' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(button)
    expect(mockInvoke).not.toHaveBeenCalledWith('enhance-prompt', expect.anything())
  })

  it('becomes enabled once a product is chosen, with character/film type/camera/theme untouched', async () => {
    renderWizard()
    await chooseProduct()

    const button = screen.getByRole('button', { name: 'Generate prompt' })
    await waitFor(() => expect(button).not.toBeDisabled())
    expect(button).toHaveAttribute('aria-disabled', 'false')
  })

  it('fills the prompt on success and still offers undo', async () => {
    renderWizard()
    await chooseProduct()

    fireEvent.click(screen.getByRole('button', { name: 'Generate prompt' }))
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('enhance-prompt', expect.anything()),
    )

    const textarea = await waitFor(() => {
      const el = screen.getByPlaceholderText(/Describe the film/i) as HTMLTextAreaElement
      expect(el.value).toContain('A generated film idea')
      return el
    })

    // Existing undo behavior is preserved.
    const undo = await screen.findByText(/Undo/i)
    fireEvent.click(undo)
    await waitFor(() => expect(textarea.value).toBe(''))
  })

  it('stays blocked while a generation is already in flight', async () => {
    let resolveInvoke: ((v: unknown) => void) | undefined
    mockInvoke.mockImplementation(
      (fn: string) =>
        fn === 'enhance-prompt'
          ? new Promise((res) => {
              resolveInvoke = res
            })
          : Promise.resolve({ data: null, error: null }),
    )

    renderWizard()
    await chooseProduct()

    const button = screen.getByRole('button', { name: 'Generate prompt' })
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    fireEvent.click(button)
    expect(mockInvoke.mock.calls.filter((c) => c[0] === 'enhance-prompt')).toHaveLength(1)

    resolveInvoke!({ data: { enhancedPrompt: 'done' }, error: null })
    await waitFor(() => expect(button).not.toBeDisabled())
  })
})
