import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import MakeFilmWizardDialog, { inFlightSigns } from './MakeFilmWizardDialog'

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

beforeEach(() => {
  vi.restoreAllMocks()
  inFlightSigns.clear()
  mockStorage.from.mockImplementation(() => ({
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed/1.png' }, error: null })),
  }))
  mockFrom.mockImplementation((table: string) => {
    if (table === 'generator_user_images') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: [
                    { id: 'prod-1', storage_path: 'user-images/prod-1.png', title: 'Test product', category: 'product', image_type: null },
                  ],
                  error: null,
                })),
              })),
            })),
          })),
        })),
      }
    }
    return { select: vi.fn(() => ({ eq: vi.fn(() => ({ is: vi.fn(() => ({ order: vi.fn(async () => ({ data: [], error: null })) })) })) })) }
  })
})

describe('Product Picker image retry', () => {
  it('re-signs a broken image URL on error and allows selection after success', async () => {
    let signCount = 0
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(async () => {
        signCount++
        return { data: { signedUrl: `https://signed/${signCount}.png` }, error: null }
      }),
    }))
    renderWizard()

    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())

    const img = screen.getByAltText('Test product')
    fireEvent.error(img)

    await waitFor(() => expect(signCount).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(img).toHaveAttribute('src', expect.stringContaining('signed')))

    fireEvent.click(screen.getByText('Test product'))
    await waitFor(() => expect(screen.queryByText('Choose product')).not.toBeInTheDocument())
  })

  it('shows Try again after two consecutive failures and blocks selection', async () => {
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(async () => ({ data: null, error: new Error('signing failed') })),
    }))
    renderWizard()

    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())

    const img = screen.getByAltText('Test product')
    fireEvent.error(img)
    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Test product'))
    expect(screen.queryByText('Choose product')).toBeInTheDocument()
  })

  it('deduplicates concurrent signing requests for the same storage path', async () => {
    let callCount = 0
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(async () => {
        callCount++
        await new Promise((resolve) => setTimeout(resolve, 50))
        return { data: { signedUrl: 'https://signed/once.png' }, error: null }
      }),
    }))
    renderWizard()

    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())

    const img = screen.getByAltText('Test product')
    fireEvent.error(img)
    fireEvent.error(img)

    await waitFor(() => expect(callCount).toBe(1))
  })

  it('ignores stale signing responses after dialog is closed', async () => {
    let resolveSign: ((value: unknown) => void) | null = null
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(() => new Promise((res) => { resolveSign = res })),
    }))
    renderWizard()

    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())

    const img = screen.getByAltText('Test product')
    fireEvent.error(img)

    // Close dialog via Escape — controller aborts, new controller created
    fireEvent.keyDown(document, { key: 'Escape' })

    // Stale response arrives
    expect(resolveSign).not.toBeNull()
    resolveSign!({ data: { signedUrl: 'https://signed/late.png' }, error: null })

    // Re-open dialog
    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())

    // Stale response should not have updated the image
    expect(screen.getByAltText('Test product')).not.toHaveAttribute('src', 'https://signed/late.png')
  })

  it('does not enter a retry loop after a successful re-sign', async () => {
    let signCount = 0
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(async () => {
        signCount++
        return { data: { signedUrl: `https://signed/${signCount}.png` }, error: null }
      }),
    }))
    renderWizard()

    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())

    const img = screen.getByAltText('Test product')
    fireEvent.error(img)
    await waitFor(() => expect(signCount).toBe(1))

    // Second error should NOT trigger another sign (auto-retry exhausted)
    fireEvent.error(img)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(signCount).toBe(1)
  })
})
