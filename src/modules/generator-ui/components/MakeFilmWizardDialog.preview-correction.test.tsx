import { beforeEach, describe, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MakeFilmWizardDialog from './MakeFilmWizardDialog'

const { mockFrom, mockInvoke, mockStorage } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockInvoke: vi.fn(),
  mockStorage: {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed/product.png' }, error: null })),
    })),
  },
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: mockStorage,
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}))

const generateSceneImage = vi.fn(async (..._args: unknown[]) => 'data:image/png;base64,SCENE')
const onApprove = vi.fn()

const SIX_PLANS = [
  'Opening shot with product front and center.',
  'Close-up detail of product features.',
  'Product in use, medium shot.',
  'Dynamic angle showing product benefits.',
  'Character interaction with product.',
  'Final call-to-action with product logo.',
]
const writeScenario = vi.fn(async () => SIX_PLANS)
const FAILURE_REASON = 'The hands float away from the stirrup and gravity is impossible.'

function evaluation(passed: boolean) {
  const ok = { passed: true, reason: 'Looks correct.' }
  return {
    physicalPlausibility: passed ? ok : { passed: false, reason: FAILURE_REASON },
    productRelevance: ok,
    surroundingContinuity: ok,
    plannedActionFaithfulness: ok,
    contradiction: null,
    summary: passed ? 'Preview matches the plan.' : FAILURE_REASON,
    passed,
  }
}

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

async function reachPreviewGeneration() {
  fireEvent.click(screen.getByText('Choose product'))
  await waitFor(() => expect(screen.getByText('Test product')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Test product'))
  fireEvent.change(screen.getByPlaceholderText(/Describe the film/i), { target: { value: 'A film' } })
  fireEvent.click(screen.getByText('Write scenario'))
  await waitFor(() => expect(screen.getByText(/Shot 1/)).toBeInTheDocument())
  fireEvent.click(screen.getByText('Generate preview images'))
}

function setEvaluator(
  decide: (shotIndex: number, attempt: number) => boolean,
) {
  const attempts = new Map<number, number>()
  mockInvoke.mockImplementation(async (functionName: string, options?: { body?: { shotIndex?: number } }) => {
    if (functionName !== 'film-preview-quality') return { data: null, error: null }
    const shotIndex = options?.body?.shotIndex ?? -1
    const attempt = (attempts.get(shotIndex) ?? 0) + 1
    attempts.set(shotIndex, attempt)
    return { data: { evaluation: evaluation(decide(shotIndex, attempt)) }, error: null }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  generateSceneImage.mockResolvedValue('data:image/png;base64,SCENE')
  writeScenario.mockResolvedValue(SIX_PLANS)
  mockProductRows()
  setEvaluator(() => true)
})

describe('Make Full Film Step 3 independent preview quality retries', () => {
  it('accepts six valid independent shots without batch rejection and generates each once', async () => {
    renderWizard()
    await reachPreviewGeneration()

    await waitFor(() => expect(generateSceneImage).toHaveBeenCalledTimes(6))
    await waitFor(() => expect(screen.getAllByAltText(/Preview for scene/)).toHaveLength(6))

    for (const plan of SIX_PLANS) {
      const calls = generateSceneImage.mock.calls.filter((call) => call[0] === plan)
      expect(calls).toHaveLength(1)
      expect(calls[0][7]).toBeUndefined()
    }
  })

  it('retries only one invalid shot, preserves valid neighbors, and forwards the reviewer correction separately', async () => {
    setEvaluator((shotIndex, attempt) => shotIndex !== 2 || attempt > 1)
    renderWizard()
    await reachPreviewGeneration()

    await waitFor(() => expect(generateSceneImage).toHaveBeenCalledTimes(7))
    await waitFor(() => expect(screen.getAllByAltText(/Preview for scene/)).toHaveLength(6))

    for (const [index, plan] of SIX_PLANS.entries()) {
      const calls = generateSceneImage.mock.calls.filter((call) => call[0] === plan)
      expect(calls).toHaveLength(index === 2 ? 2 : 1)
    }

    const retriedShotCalls = generateSceneImage.mock.calls.filter((call) => call[0] === SIX_PLANS[2])
    expect(retriedShotCalls[1][0]).toBe(SIX_PLANS[2])
    expect(retriedShotCalls[1][0]).not.toContain('QUALITY CORRECTION')
    expect(retriedShotCalls[1][7]).toContain('QUALITY CORRECTION')
    expect(retriedShotCalls[1][7]).toContain('hands float away from the stirrup')
  })

  it('keeps the last identity-safe candidate without exposing review diagnostics or blocking approval', async () => {
    setEvaluator((shotIndex) => shotIndex !== 1)
    renderWizard()
    await reachPreviewGeneration()

    await waitFor(() => expect(generateSceneImage).toHaveBeenCalledTimes(8))
    await waitFor(() => expect(screen.getAllByAltText(/Preview for scene/)).toHaveLength(6))

    const invalidCalls = generateSceneImage.mock.calls.filter((call) => call[0] === SIX_PLANS[1])
    expect(invalidCalls).toHaveLength(3)
    for (const [index, plan] of SIX_PLANS.entries()) {
      if (index === 1) continue
      expect(generateSceneImage.mock.calls.filter((call) => call[0] === plan)).toHaveLength(1)
      expect(screen.getByAltText(`Preview for scene ${index + 1}`)).toBeInTheDocument()
    }
    expect(screen.getByAltText('Preview for scene 2')).toHaveAttribute('src', 'data:image/png;base64,SCENE')
    expect(screen.queryByText(/failed action-quality review after 3 attempts/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve & Make Film' })).toBeEnabled()
    expect(screen.getAllByRole('button', { name: /Regenerate$/ }).length).toBeGreaterThan(0)
  })
})
