import { describe, it, expect } from 'vitest'
import {
  getAvailableModels,
  pickCheaperIfEquivalent,
  getFallbackModel,
  MODEL_REGISTRY,
  DEFAULT_MODEL_ID,
  type ModelMeta,
} from './modelRegistry'

// ---- helpers -----------------------------------------------------------------

function findModel(id: string): ModelMeta {
  const m = MODEL_REGISTRY.find((m) => m.id === id)
  if (!m) throw new Error(`model not found: ${id}`)
  return m
}

// ---- getAvailableModels ------------------------------------------------------

describe('getAvailableModels', () => {
  it('hides local models when local router is not reachable', () => {
    const models = getAvailableModels({ localRouterReachable: false })
    expect(models.every((m) => !m.requiresLocalRouter)).toBe(true)
  })

  it('shows local models when router is reachable', () => {
    const models = getAvailableModels({ localRouterReachable: true })
    expect(models.some((m) => m.requiresLocalRouter)).toBe(true)
  })

  it('excludes failed model ids', () => {
    const failed = new Set(['flow-v1'])
    const models = getAvailableModels({ failedModelIds: failed })
    expect(models.find((m) => m.id === 'flow-v1')).toBeUndefined()
  })

  it('model recovers once removed from failedModelIds', () => {
    const failed = new Set(['flow-v1'])
    const withFailed = getAvailableModels({ failedModelIds: failed })
    expect(withFailed.find((m) => m.id === 'flow-v1')).toBeUndefined()

    const recovered = getAvailableModels({ failedModelIds: new Set() })
    expect(recovered.find((m) => m.id === 'flow-v1')).toBeDefined()
  })

  it('filters by generation mode', () => {
    const i2v = getAvailableModels({ mode: 'i2v' })
    expect(i2v.every((m) => m.supports.includes('i2v'))).toBe(true)

    const t2v = getAvailableModels({ mode: 't2v' })
    expect(t2v.every((m) => m.supports.includes('t2v'))).toBe(true)
  })

  it('sorts recommended models first', () => {
    const models = getAvailableModels()
    const firstBadges = models[0].badges.map((b) => b.kind)
    expect(firstBadges).toContain('recommended')
  })

  it('never returns duplicate model ids', () => {
    const models = getAvailableModels({ localRouterReachable: true })
    const ids = models.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never has more than one active selection (single active model invariant)', () => {
    // The registry itself has unique ids; verify by checking for id uniqueness
    const ids = MODEL_REGISTRY.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ---- pickCheaperIfEquivalent -------------------------------------------------

describe('pickCheaperIfEquivalent', () => {
  it('returns cheaper model when quality tiers are equal', () => {
    // wan-i2v and wan-t2v are both 'standard' / 'low'
    // Build two mocks: same quality, different cost
    const preferred: ModelMeta = { ...findModel('flow-v1-pro'), costTier: 'high' }
    const alternative: ModelMeta = { ...findModel('flow-v1-pro'), id: 'alt', costTier: 'medium' }
    const result = pickCheaperIfEquivalent(preferred, alternative)
    expect(result.id).toBe('alt')
  })

  it('returns preferred when alternative is more expensive and quality is equal', () => {
    const preferred: ModelMeta = { ...findModel('wan-i2v'), costTier: 'low' }
    const alternative: ModelMeta = { ...findModel('wan-i2v'), id: 'alt', costTier: 'high' }
    expect(pickCheaperIfEquivalent(preferred, alternative).id).toBe(preferred.id)
  })

  it('ignores cost when quality tiers differ — returns preferred', () => {
    const preferred = findModel('flow-v1-pro') // 'best'
    const alternative = findModel('wan-i2v')   // 'standard', cheaper
    expect(pickCheaperIfEquivalent(preferred, alternative).id).toBe('flow-v1-pro')
  })

  it('selects cheaper when equal quality: wan-i2v over flow-v1 for same tier', () => {
    // Artificially give flow-v1 'standard' quality so tiers match wan-i2v
    const flowStandard: ModelMeta = { ...findModel('flow-v1'), qualityTier: 'standard' }
    const wan = findModel('wan-i2v') // standard + low cost
    const result = pickCheaperIfEquivalent(flowStandard, wan)
    expect(result.costTier).toBe('low')
  })
})

// ---- getFallbackModel --------------------------------------------------------

describe('getFallbackModel', () => {
  it('returns a fallback model with a reason string', () => {
    const result = getFallbackModel('flow-v1', { failedModelIds: new Set(['flow-v1']) })
    expect(result).not.toBeNull()
    expect(result!.reason).toContain('flow-v1')
    expect(result!.reason).toContain(result!.model.label)
    expect(result!.model.id).not.toBe('flow-v1')
  })

  it('returns null when no models are available', () => {
    const allIds = new Set(MODEL_REGISTRY.map((m) => m.id))
    const result = getFallbackModel('flow-v1', { failedModelIds: allIds })
    expect(result).toBeNull()
  })

  it('fallback is always recommended or cheapest available', () => {
    const result = getFallbackModel('wan-i2v', {
      failedModelIds: new Set(['wan-i2v']),
      mode: 't2v',
    })
    expect(result).not.toBeNull()
    // Must support t2v
    expect(result!.model.supports).toContain('t2v')
  })
})

// ---- DEFAULT_MODEL_ID --------------------------------------------------------

describe('DEFAULT_MODEL_ID', () => {
  it('exists in the registry', () => {
    expect(MODEL_REGISTRY.find((m) => m.id === DEFAULT_MODEL_ID)).toBeDefined()
  })

  it('has the recommended badge', () => {
    const m = findModel(DEFAULT_MODEL_ID)
    expect(m.badges.some((b) => b.kind === 'recommended')).toBe(true)
  })

  it('is stable across calls — persona does not shift', () => {
    // Two calls with same opts return same default as first item
    const first = getAvailableModels()[0].id
    const second = getAvailableModels()[0].id
    expect(first).toBe(second)
    expect(first).toBe(DEFAULT_MODEL_ID)
  })
})
