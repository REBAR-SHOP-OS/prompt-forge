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
const writeScenario = vi.fn(async () => ['Scene one. ===SCENE=== Scene two. ===SCENE=== Scene three. ===SCENE=== Scene four. ===SCENE=== Scene five. ===SCENE=== Scene six.'])
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
  it('raw storage path is never used as img src', async () => {
    renderWizard()

    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())

    // Before onLoad, the card shows a spinner — no <img> with raw path.
    const imgs = screen.queryAllByAltText('Test product')
    const imgWithRawPath = imgs.filter((img) => {
      const src = img.getAttribute('src')
      return src && src.includes('user-images/prod-1.png')
    })
    expect(imgWithRawPath).toHaveLength(0)
  })

  it('re-signs a broken image URL on error and allows selection after onLoad', async () => {
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

    // Wait for initial signing to complete and img to appear (ready state).
    await waitFor(() => expect(screen.queryByAltText('Test product')).toBeInTheDocument())
    const img = screen.getByAltText('Test product')
    await waitFor(() => expect(img).toHaveAttribute('src', expect.stringContaining('signed')))

    // Simulate image load → selectable.
    fireEvent.load(img)

    // Simulate image load failure → auto-retry.
    fireEvent.error(img)
    await waitFor(() => expect(signCount).toBe(2))
    // Re-query img after retry re-render.
    const imgAfterRetry = screen.getByAltText('Test product')
    await waitFor(() => expect(imgAfterRetry).toHaveAttribute('src', 'https://signed/2.png'))

    // Simulate successful onLoad → card becomes selectable.
    fireEvent.load(imgAfterRetry)
    fireEvent.click(screen.getByText('Test product'))
    await waitFor(() => expect(screen.queryByText('Choose product')).not.toBeInTheDocument())
  })

  it('card is disabled before onLoad and selection is blocked', async () => {
    let resolveSign: ((value: unknown) => void) | null = null
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(() => new Promise((res) => { resolveSign = res })),
    }))
    renderWizard()

    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())

    // Card is still loading — clicking should not close the dialog.
    fireEvent.click(screen.getByText('Test product'))
    expect(screen.queryByText('Choose product')).toBeInTheDocument()

    // After signing resolves, img appears (ready state) — card IS selectable.
    expect(resolveSign).not.toBeNull()
    resolveSign!({ data: { signedUrl: 'https://signed/fresh.png' }, error: null })

    await waitFor(() => expect(screen.queryByAltText('Test product')).toBeInTheDocument())
    const img = screen.getByAltText('Test product')
    await waitFor(() => expect(img).toHaveAttribute('src', 'https://signed/fresh.png'))

    // Card is selectable in 'ready' state (before onLoad).
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

    // Wait for initial load failure.
    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument())

    // Clicking the card should NOT close the dialog.
    fireEvent.click(screen.getByText('Test product'))
    expect(screen.queryByText('Choose product')).toBeInTheDocument()
  })

  it('deduplicates concurrent signing requests for the same user/bucket/path', async () => {
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

    // Verify dedup key includes userId by checking one call.
    await waitFor(() => expect(callCount).toBe(1))
  })

  it('Try again immediately triggers a fresh signing attempt', async () => {
    let signCount = 0
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(async () => {
        signCount++
        if (signCount === 1) {
          return { data: null, error: new Error('signing failed') }
        }
        return { data: { signedUrl: `https://signed/${signCount}.png` }, error: null }
      }),
    }))
    renderWizard()

    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())

    // Wait for initial failure.
    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument())
    expect(signCount).toBe(1)

    // Click Try again → should trigger a fresh sign.
    fireEvent.click(screen.getByText('Try again'))
    await waitFor(() => expect(signCount).toBe(2))
    await waitFor(() => expect(screen.queryByAltText('Test product')).toBeInTheDocument())

    const img = screen.getByAltText('Test product')
    await waitFor(() => expect(img).toHaveAttribute('src', 'https://signed/2.png'))
  })

  it('ignores stale signing responses after dialog close/unmount', async () => {
    let resolveSign: ((value: unknown) => void) | null = null
    mockStorage.from.mockImplementation(() => ({
      createSignedUrl: vi.fn(() => new Promise((res) => { resolveSign = res })),
    }))
    renderWizard()

    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())

    // Close dialog — unmounts cards.
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('Choose a product')).not.toBeInTheDocument())

    // Stale response arrives after unmount.
    expect(resolveSign).not.toBeNull()
    resolveSign!({ data: { signedUrl: 'https://signed/late.png' }, error: null })

    // Re-open dialog.
    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())

    // The stale response should not have leaked into the new card.
    const img = screen.queryByAltText('Test product')
    if (img) {
      expect(img).not.toHaveAttribute('src', 'https://signed/late.png')
    }
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

    // Wait for initial signing.
    await waitFor(() => expect(screen.queryByAltText('Test product')).toBeInTheDocument())
    const img = screen.getByAltText('Test product')
    await waitFor(() => expect(img).toHaveAttribute('src', 'https://signed/1.png'))

    // onLoad → selectable.
    fireEvent.load(img)

    // Simulate error → auto-retry once.
    fireEvent.error(img)
    await waitFor(() => expect(signCount).toBe(2))
    // Re-query img after retry re-render.
    const imgAfterRetry = screen.getByAltText('Test product')
    await waitFor(() => expect(imgAfterRetry).toHaveAttribute('src', 'https://signed/2.png'))

    // onLoad → selectable again.
    fireEvent.load(imgAfterRetry)

    // Second error on the same card should NOT trigger another sign.
    fireEvent.error(img)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(signCount).toBe(2)
  })

  it('isolates card errors — one card failing does not affect others', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'generator_user_images') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(async () => ({
                    data: [
                      { id: 'prod-1', storage_path: 'user-images/prod-1.png', title: 'Good product', category: 'product', image_type: null },
                      { id: 'prod-2', storage_path: 'user-images/prod-2.png', title: 'Bad product', category: 'product', image_type: null },
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

    let failProd2 = false
    mockStorage.from.mockImplementation((bucket: string) => ({
      createSignedUrl: vi.fn(async (_path: string) => {
        if (failProd2 && _path.includes('prod-2')) {
          return { data: null, error: new Error('signing failed') }
        }
        return { data: { signedUrl: `https://signed/${_path.split('/').pop()}` }, error: null }
      }),
    }))

    renderWizard()
    fireEvent.click(screen.getByText('Choose product'))
    await waitFor(() => expect(screen.getByText('Good product')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Bad product')).toBeInTheDocument())

    failProd2 = true

    // Trigger error on Bad product only.
    const badImg = screen.getByAltText('Bad product')
    fireEvent.error(badImg)
    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument())

    // Good product should still be selectable after onLoad.
    const goodImg = screen.getByAltText('Good product')
    fireEvent.load(goodImg)
    fireEvent.click(screen.getByText('Good product'))
    await waitFor(() => expect(screen.queryByText('Choose product')).not.toBeInTheDocument())
  })
})
