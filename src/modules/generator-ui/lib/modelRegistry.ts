/**
 * Provider-neutral video model registry.
 *
 * All model metadata lives here so the picker, cost estimator, and routing
 * logic share a single source of truth. Costs are reference ranges, not exact
 * billable rates — the backend computes actual spend.
 */

export type ModelQualityTier = 'standard' | 'high' | 'best'
export type ModelCostTier = 'free' | 'low' | 'medium' | 'high'
export type ModelStatus = 'available' | 'degraded' | 'unavailable'
export type GenerationMode = 't2v' | 'i2v'
export type ProviderKey = 'wan' | 'flow' | 'local'

export interface ModelBadge {
  kind: 'recommended' | 'fast' | 'best-quality' | 'cost'
  label: string
}

export interface ModelMeta {
  id: string
  label: string
  /** One-line description shown in the picker. */
  description: string
  providerKey: ProviderKey
  /** Canonical model string sent to the provider. */
  model: string
  supports: GenerationMode[]
  qualityTier: ModelQualityTier
  costTier: ModelCostTier
  /**
   * Human-readable cost hint. Never claim exact pricing — the backend is
   * authoritative. This is a UI label only and should use "~" prefix.
   */
  costHint: string
  badges: ModelBadge[]
  /**
   * Whether this model requires a local video router. Local models are hidden
   * by default; the picker surfaces them only when the router is confirmed
   * reachable.
   */
  requiresLocalRouter: boolean
}

/** Full registry — always modify here, never inline in the picker. */
export const MODEL_REGISTRY: ModelMeta[] = [
  {
    id: 'flow-v1',
    label: 'Veo 3 Fast',
    description: 'Good quality, fastest generation.',
    providerKey: 'flow',
    model: 'flow-video-1',
    supports: ['t2v', 'i2v'],
    qualityTier: 'high',
    costTier: 'medium',
    costHint: '~$0.10/s',
    badges: [
      { kind: 'recommended', label: 'Recommended' },
      { kind: 'fast', label: 'Fast' },
    ],
    requiresLocalRouter: false,
  },
  {
    id: 'flow-v1-pro',
    label: 'Veo 3.1 Pro',
    description: 'Highest quality. Supports last-frame and reference images.',
    providerKey: 'flow',
    model: 'flow-video-1-pro',
    supports: ['t2v', 'i2v'],
    qualityTier: 'best',
    costTier: 'high',
    costHint: '~$0.40/s',
    badges: [{ kind: 'best-quality', label: 'Best quality' }],
    requiresLocalRouter: false,
  },
  {
    id: 'wan-i2v',
    label: 'Wan 2.7 — Image to Video',
    description: 'Animate a start and/or end frame.',
    providerKey: 'wan',
    model: 'wan2.7-i2v-2026-04-25',
    supports: ['i2v'],
    qualityTier: 'standard',
    costTier: 'low',
    costHint: '~$0.15/clip',
    badges: [{ kind: 'cost', label: 'Low cost' }],
    requiresLocalRouter: false,
  },
  {
    id: 'wan-t2v',
    label: 'Wan 2.7 — Text to Video',
    description: 'Generate a clip from a prompt.',
    providerKey: 'wan',
    model: 'wan2.7-t2v-2026-04-25',
    supports: ['t2v'],
    qualityTier: 'standard',
    costTier: 'low',
    costHint: '~$0.15/clip',
    badges: [{ kind: 'cost', label: 'Low cost' }],
    requiresLocalRouter: false,
  },
  {
    id: 'local-wan21-i2v',
    label: 'Local Wan 2.1 — Image to Video',
    description: 'Runs on your local GPU router. No cloud cost.',
    providerKey: 'local',
    model: 'local/wan-2.1-i2v',
    supports: ['i2v'],
    qualityTier: 'standard',
    costTier: 'free',
    costHint: 'Free',
    badges: [{ kind: 'cost', label: 'Free' }],
    requiresLocalRouter: true,
  },
  {
    id: 'local-wan21-t2v',
    label: 'Local Wan 2.1 — Text to Video',
    description: 'Runs on your local GPU router. No cloud cost.',
    providerKey: 'local',
    model: 'local/wan-2.1-t2v',
    supports: ['t2v'],
    qualityTier: 'standard',
    costTier: 'free',
    costHint: 'Free',
    badges: [{ kind: 'cost', label: 'Free' }],
    requiresLocalRouter: true,
  },
  {
    id: 'local-ltx-i2v',
    label: 'Local LTX — Image to Video',
    description: 'Runs on your local GPU router. No cloud cost.',
    providerKey: 'local',
    model: 'local/ltx-video-i2v',
    supports: ['i2v'],
    qualityTier: 'standard',
    costTier: 'free',
    costHint: 'Free',
    badges: [{ kind: 'cost', label: 'Free' }],
    requiresLocalRouter: true,
  },
  {
    id: 'local-ltx-t2v',
    label: 'Local LTX — Text to Video',
    description: 'Runs on your local GPU router. No cloud cost.',
    providerKey: 'local',
    model: 'local/ltx-video-t2v',
    supports: ['t2v'],
    qualityTier: 'standard',
    costTier: 'free',
    costHint: 'Free',
    badges: [{ kind: 'cost', label: 'Free' }],
    requiresLocalRouter: true,
  },
]

// ---- Filtering ---------------------------------------------------------------

export interface ModelFilterOptions {
  /** Only include models that support this generation mode. */
  mode?: GenerationMode
  /** When false (default) hide models that require the local router. */
  localRouterReachable?: boolean
  /** Set of model ids that are currently confirmed unavailable/failed. */
  failedModelIds?: ReadonlySet<string>
}

/**
 * Return the subset of models suitable for the picker, sorted:
 * 1. Recommended badges first.
 * 2. Then by cost tier ascending (free → low → medium → high).
 *
 * Local models are hidden unless `localRouterReachable` is true.
 * Failed/unavailable models are excluded — callers should surface a single
 * fallback message explaining why instead of showing a broken option.
 */
export function getAvailableModels(opts: ModelFilterOptions = {}): ModelMeta[] {
  const { mode, localRouterReachable = false, failedModelIds = new Set() } = opts

  const COST_ORDER: Record<ModelCostTier, number> = { free: 0, low: 1, medium: 2, high: 3 }

  return MODEL_REGISTRY.filter((m) => {
    if (m.requiresLocalRouter && !localRouterReachable) return false
    if (failedModelIds.has(m.id)) return false
    if (mode && !m.supports.includes(mode)) return false
    return true
  }).sort((a, b) => {
    const aRec = a.badges.some((b) => b.kind === 'recommended') ? 0 : 1
    const bRec = b.badges.some((b) => b.kind === 'recommended') ? 0 : 1
    if (aRec !== bRec) return aRec - bRec
    return COST_ORDER[a.costTier] - COST_ORDER[b.costTier]
  })
}

// ---- Cost-aware selection ----------------------------------------------------

/**
 * Given two models of equal or comparable quality, return the cheaper one.
 * When quality tiers differ, always returns `preferred`.
 * When quality is equal, returns whichever has the lower cost tier.
 */
export function pickCheaperIfEquivalent(preferred: ModelMeta, alternative: ModelMeta): ModelMeta {
  if (preferred.qualityTier !== alternative.qualityTier) return preferred
  const COST_ORDER: Record<ModelCostTier, number> = { free: 0, low: 1, medium: 2, high: 3 }
  return COST_ORDER[alternative.costTier] < COST_ORDER[preferred.costTier] ? alternative : preferred
}

// ---- Fallback ----------------------------------------------------------------

export interface FallbackResult {
  model: ModelMeta
  reason: string
}

/**
 * Choose a safe fallback model when the requested model is unavailable.
 * Returns the cheapest available model of the required mode with a plain
 * English reason string for display in the UI.
 */
export function getFallbackModel(
  requestedId: string,
  opts: ModelFilterOptions,
): FallbackResult | null {
  const available = getAvailableModels(opts)
  if (available.length === 0) return null
  const fallback = available[0]
  return {
    model: fallback,
    reason: `"${requestedId}" is currently unavailable. Using ${fallback.label} instead.`,
  }
}

// ---- i2v / t2v sibling resolution -------------------------------------------

/** Return the i2v counterpart of a model, preferring same provider family. */
export function toImageToVideoModel(model: ModelMeta, pool: ModelMeta[] = MODEL_REGISTRY): ModelMeta {
  if (model.supports.includes('i2v')) return model
  const base = model.id.replace(/-t2v$/, '')
  const sibling = pool.find(
    (m) => m.providerKey === model.providerKey && m.supports.includes('i2v') && m.id.replace(/-i2v$/, '') === base,
  )
  return (
    sibling ??
    pool.find((m) => m.providerKey === model.providerKey && m.supports.includes('i2v')) ??
    pool.find((m) => m.id === 'wan-i2v') ??
    model
  )
}

/** Return the t2v counterpart of a model, preferring same provider family. */
export function toTextToVideoModel(model: ModelMeta, pool: ModelMeta[] = MODEL_REGISTRY): ModelMeta {
  if (model.supports.includes('t2v')) return model
  const base = model.id.replace(/-i2v$/, '')
  const sibling = pool.find(
    (m) => m.providerKey === model.providerKey && m.supports.includes('t2v') && m.id.replace(/-t2v$/, '') === base,
  )
  return (
    sibling ??
    pool.find((m) => m.providerKey === model.providerKey && m.supports.includes('t2v')) ??
    pool.find((m) => m.id === 'wan-t2v') ??
    model
  )
}

/** The canonical default model id for new sessions. */
export const DEFAULT_MODEL_ID = 'flow-v1'
