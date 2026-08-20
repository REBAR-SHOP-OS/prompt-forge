// Pure decision logic for the "Make Full Film" wizard.
//
// Kept free of React / Supabase / DOM so it can be unit-tested directly and so
// the wizard (MakeFilmWizardDialog) and the render pipeline (DashboardPage)
// share one source of truth for the film's structure. This is the single
// authority for:
//   - how a chosen total duration splits into per-clip durations,
//   - how many scenes a duration expects,
//   - how product / character / camera / theme / continuity are carried into
//     scenario, image and clip prompts,
//   - how the wizard's selections are carried through approval into every job.

export type FilmDuration = 5 | 10 | 15 | 30 | 45 | 60 | 90 | 135
export type FilmAspect = '16:9' | '9:16' | '1:1'
export type Ratio = '9:16' | '1:1' | '16:9'

/** Per-clip durations the job contract allows (5 | 10 | 15). */
export type ClipDuration = 5 | 10 | 15

export const FILM_DURATIONS: FilmDuration[] = [5, 10, 15, 30, 45, 60, 90, 135]

/**
 * How many sequential scenes a total duration expects. Mirrors the
 * scenario-write edge function so the frontend and backend agree.
 *   5->1, 10->1, 15->1, 30->2, 45->3, 60->4, 90->6, 135->9
 */
export function expectedSceneCount(duration: number): number {
  if (duration === 135) return 9
  if (duration === 90) return 6
  if (duration === 60) return 4
  if (duration === 45) return 3
  if (duration === 30) return 2
  return 1
}

/**
 * Split a chosen total duration into per-clip durations that the job contract
 * supports (5 | 10 | 15). The sum of the returned clip durations ALWAYS equals
 * the chosen total:
 *   5s  -> [5]
 *   10s -> [10]
 *   15s -> [15]
 *   30s -> [15, 15]
 *   45s -> [15, 15, 15]
 *   60s -> [15, 15, 15, 15]
 *   90s -> [15, 15, 15, 15, 15, 15]
 *   135s-> [15, 15, 15, 15, 15, 15, 15, 15, 15]
 */
export function computeClipDurations(totalSeconds: number): ClipDuration[] {
  const count = expectedSceneCount(totalSeconds)
  if (count <= 1) {
    // Single clip: 5, 10 or 15 (all contract-valid).
    if (totalSeconds === 10) return [10]
    if (totalSeconds === 15) return [15]
    return [5]
  }
  // Multi-scene durations are all exact multiples of 15.
  return Array.from({ length: count }, () => 15 as ClipDuration)
}

/** Sum of clip durations -- used to assert the split equals the chosen time. */
export function sumClipDurations(clips: ClipDuration[]): number {
  return clips.reduce((acc, c) => acc + c, 0)
}

/** Camera coverage (framing) for a single 5-second plan/shot. */
export type PlanCoverage = 'wide' | 'medium' | 'close'

/**
 * How many 5-second plans (shots) a total duration expects. The unit of work
 * changed from the card (5|10|15s) to the plan (5s), so every duration maps to
 * duration/5 plans:
 *   5->1, 10->2, 15->3, 30->6, 45->9, 60->12, 90->18, 135->27
 */
export function expectedPlanCount(duration: number): number {
  return Math.max(1, Math.round(duration / 5))
}

/**
 * Split a total duration into 5-second plan durations. The sum always equals
 * the total, and every plan is a contract-valid 5s clip.
 */
export function computePlanDurations(totalSeconds: number): ClipDuration[] {
  return Array.from({ length: expectedPlanCount(totalSeconds) }, () => 5 as ClipDuration)
}

/**
 * Camera coverage (framing) for each plan, derived from the card structure:
 *   - a 5s card  -> 1 plan  -> medium
 *   - a 10s card -> 2 plans -> wide, close
 *   - a 15s card -> 3 plans -> wide, medium, close
 * Multi-card films (30/45/60/90/135) are all 15s cards, so coverage cycles
 * wide -> medium -> close across the whole film.
 */
export function computePlanCoverage(totalSeconds: number): PlanCoverage[] {
  const cards = computeClipDurations(totalSeconds)
  const coverage: PlanCoverage[] = []
  for (const card of cards) {
    if (card === 5) coverage.push('medium')
    else if (card === 10) coverage.push('wide', 'close')
    else coverage.push('wide', 'medium', 'close')
  }
  return coverage
}

/**
 * Split a single clip's duration into contiguous, non-overlapping timed beats
 * whose ranges sum EXACTLY to the clip duration. This is the shared source of
 * truth for how a scene's action is paced on screen, so the scenario-write
 * backend and the wizard agree on the beat structure.
 *
 *   5s  -> ["0-5"]
 *   10s -> ["0-5", "5-10"]
 *   15s -> ["0-4", "4-9", "9-15"]
 *
 * The ranges are contiguous (end of one equals start of the next) and cover
 * the whole clip with no gaps, no overlap and no time beyond the duration.
 */
export function computeSceneBeats(clipSeconds: number): string[] {
  if (clipSeconds === 15) return ['0-4', '4-9', '9-15']
  if (clipSeconds === 10) return ['0-5', '5-10']
  return ['0-5']
}

/**
 * A short, human-readable beat guide for a clip duration, used to instruct the
 * scenario model how to pace a single scene. Mirrors computeSceneBeats.
 */
export function beatGuideForClip(clipSeconds: number): string {
  const beats = computeSceneBeats(clipSeconds)
  return `${clipSeconds}s = ${beats.length} beat${beats.length === 1 ? '' : 's'} (${beats.join(', ')})`
}

/**
 * Narration word budget for a clip, tied to its real time so spoken lines stay
 * realistically timed with pauses. Roughly 2 words per second, so a 15s scene
 * allows ~30 words of narration. Returns 0 when narration is disabled.
 */
export function narrationWordBudget(clipSeconds: number, withNarration: boolean): number {
  if (!withNarration) return 0
  return Math.max(1, Math.round(clipSeconds * 2))
}

/** A product or character selection carried through the wizard. */
export interface FilmSubject {
  id: string
  title: string | null
  url: string
  description?: string | null
}

export interface FilmSelections {
  product?: FilmSubject | null
  character?: FilmSubject | null
  cameraAngle?: string
  theme?: string
}

/**
 * Decide whether a character reference is a multi-view character sheet (a
 * single image with several turnaround views + facial expressions of ONE
 * person).
 *
 * The authoritative source is the explicit, persistent `image_type` metadata
 * written at save time ('character_sheet' vs 'character'). The title/URL
 * heuristic is ONLY a backward-compatible fallback for legacy rows written
 * before the image_type column existed (image_type === null): a sheet is then
 * recognized when EITHER its title carries the "-- sheet" marker that
 * generate-character-sheet appends, OR its storage key uses the
 * "character-sheet-" prefix. For new data the explicit metadata always wins,
 * so an uploaded sheet with a different title is still detected and a plain
 * character is never misclassified.
 */
export function isCharacterSheet(
  imageType: string | null | undefined,
  title: string | null | undefined,
  url: string | null | undefined,
): boolean {
  // Explicit metadata is authoritative when present.
  if (imageType === 'character_sheet') return true
  if (imageType === 'character') return false
  // Legacy row (image_type is null): fall back to the title/URL heuristic.
  const t = (title ?? '').toLowerCase()
  if (t.includes('-- sheet')) return true
  const u = url ?? ''
  // The storage key (e.g. "<userId>/character-sheet-<ts>-<uuid>.png") is the
  // stable marker written by generate-character-sheet. The signed URL embeds
  // the object path, so we can inspect it without a separate lookup.
  return /\/character-sheet-[^/]+\.(png|jpe?g|webp)(\?|$)/i.test(u)
}

/**
 * A character row as returned by the generator_user_images query. `imageType`
 * is null for legacy rows written before the image_type column existed.
 */
export interface CharacterImageRow {
  id: string
  storage_path: string | null
  title: string | null
  category: string | null
  imageType: string | null
}

/**
 * The exact Postgres error raised when the generator_user_images.image_type
 * column does not exist yet (migration not deployed to the current Lovable
 * Cloud Preview). We match ONLY this missing-column error so we never mask
 * auth, RLS, network, timeout or any other failure.
 */
export function isMissingImageTypeColumnError(message: string | null | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return (
    m.includes('generator_user_images.image_type') &&
    (m.includes('does not exist') || m.includes('column') && m.includes('not exist'))
  )
}

/**
 * Load character rows from generator_user_images with a single, scoped
 * fallback for the missing image_type column.
 *
 * The primary query selects image_type. If (and only if) the error is exactly
 * the missing-column error for generator_user_images.image_type -- i.e. the
 * migration has not been deployed to the current Lovable Cloud Preview -- we
 * retry ONCE with the legacy select (no image_type) and mark every row
 * imageType=null so the existing title/URL heuristic still classifies legacy
 * sheets. Any other error (auth, RLS, network, timeout, ...) is returned as-is
 * and never retried.
 *
 * `query` is injected so the logic is pure and unit-testable without a live
 * Supabase client. It receives the select columns and returns the Supabase
 * result shape ({ data, error }).
 */
export async function loadCharacterRows(
  query: (columns: string) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>,
): Promise<{ rows: CharacterImageRow[]; fellBack: boolean }> {
  const primary = await query('id, storage_path, title, category, image_type')
  if (!primary.error) {
    return { rows: normalizeCharacterRows(primary.data), fellBack: false }
  }
  if (!isMissingImageTypeColumnError(primary.error.message)) {
    throw new Error(primary.error.message)
  }
  // Missing image_type column: retry exactly once with the legacy select.
  const legacy = await query('id, storage_path, title, category')
  if (legacy.error) {
    throw new Error(legacy.error.message)
  }
  return { rows: normalizeCharacterRows(legacy.data, true), fellBack: true }
}

function normalizeCharacterRows(
  data: Array<Record<string, unknown>> | null | undefined,
  legacy = false,
): CharacterImageRow[] {
  return (data ?? []).map((r) => ({
    id: String(r.id ?? ''),
    storage_path: (r.storage_path as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    imageType: legacy ? null : ((r.image_type as string | null) ?? null),
  }))
}

/**
 * Build the scenario prompt enrichment for product + character + camera +
 * theme. Returns the base prompt with the directives appended. Pure and
 * deterministic so it can be unit-tested.
 */
export function buildScenarioPrompt(
  basePrompt: string,
  selections: FilmSelections,
  cameraPrompts: Record<string, string>,
  themePrompts: Record<string, string>,
): string {
  let out = basePrompt
  const { product, character, cameraAngle, theme } = selections
  if (product && character) {
    out += `\n\nPRODUCT AND CHARACTER TO FEATURE TOGETHER: The product "${product.title || 'Selected Product'}" (image: ${product.url}) AND the character "${character.title || 'Selected Character'}" (image: ${character.url}) MUST BOTH appear together prominently in every scene of the film. Show the character interacting with or holding the product.`
  } else if (product) {
    out += `\n\nPRODUCT TO FEATURE: ${product.title || 'Selected Product'}. The product image URL is: ${product.url}. This product MUST appear prominently in every scene of the film.`
  } else if (character) {
    out += `\n\nCHARACTER TO FEATURE: ${character.title || 'Selected Character'}. The character image URL is: ${character.url}. This character MUST appear prominently in every scene of the film.`
  }
  const cameraPrompt = cameraAngle ? cameraPrompts[cameraAngle] : undefined
  if (cameraPrompt) out += `\n\nCAMERA ANGLE: ${cameraPrompt}`
  const themePrompt = theme ? themePrompts[theme] : undefined
  if (themePrompt) out += `\n\nVISUAL STYLE: ${themePrompt}`
  return out
}

/**
 * Build the per-scene image prompt: a fixed identity block (product +
 * character) plus a per-scene continuity block (camera + theme + previous
 * scene). Each scene image prompt uses the same identity block so the subject
 * never drifts, and a per-scene block so the shot plan stays coherent.
 */
export function buildSceneImagePrompt(
  sceneText: string,
  selections: FilmSelections,
  cameraPrompts: Record<string, string>,
  themePrompts: Record<string, string>,
  sceneIndex: number,
  sceneCount: number,
  noText?: boolean,
): string {
  let out = sceneText
  const { product, character, cameraAngle, theme } = selections
  if (product && character) {
    out += `\n\nREFERENCE IMAGES (use BOTH in this scene):\n- PRODUCT image: ${product.url}\n- CHARACTER image: ${character.url}\nThe product and the character MUST appear together prominently in the same shot. Show the character interacting with or holding the product.`
  } else if (product) {
    out += `\n\nREFERENCE PRODUCT image: ${product.url}\nThis product MUST appear prominently in this scene.`
  } else if (character) {
    out += `\n\nREFERENCE CHARACTER image: ${character.url}\nThis character MUST appear prominently in this scene.`
  }
  const cameraPrompt = cameraAngle ? cameraPrompts[cameraAngle] : undefined
  if (cameraPrompt) out += `\n\nCAMERA ANGLE: ${cameraPrompt}`
  const themePrompt = theme ? themePrompts[theme] : undefined
  if (themePrompt) out += `\n\nVISUAL STYLE: ${themePrompt}`
  // Per-scene continuity: keep the shot plan coherent across the sequence.
  out += `\n\nSCENE ${sceneIndex + 1} OF ${sceneCount}: This is one shot in a continuous sequence. Keep the same subject, setting and lighting as the surrounding scenes so the film flows seamlessly.`
  if (noText) {
    out += `\n\nStrictly no text of any kind in the image: no words, letters, numbers, captions, subtitles, signage text, logos, or watermarks.`
  }
  return out
}

/**
 * Build the per-clip video prompt: identity lock (product + character) plus
 * camera + theme + continuity. Used by submitScenesAsJobs for every job.
 */
export function buildClipPrompt(
  sourcePrompt: string,
  selections: FilmSelections,
  cameraPrompts: Record<string, string>,
  themePrompts: Record<string, string>,
  sceneIndex: number,
  sceneCount: number,
  characterDescription?: string,
): string {
  let out = sourcePrompt
  const { product, character, cameraAngle, theme } = selections
  if (characterDescription) {
    out = [
      `CHARACTER IDENTITY LOCK (highest priority): The main character is fixed and must stay identical in every shot:`,
      characterDescription,
      `Keep the exact same face, hair, body, proportions and the EXACT same outfit -- same clothing items, colors, logos/prints, trousers, shoes and accessories. Do not change, restyle, recolor, add or remove any clothing or accessory, and do not redesign the character. Only the pose, action, camera and environment may change.`,
      ``,
      out,
    ].join('\n')
  }
  if (product) {
    const name = product.title?.trim()
    const desc = product.description?.trim()
    out = [
      `PRODUCT IDENTITY LOCK (highest priority): The advertised product${name ? ` ("${name}")` : ''} is fixed and must stay identical in every shot, matching the provided product reference image exactly.`,
      `Keep the exact same product shape, geometry, materials, colors, branding, logos, text and labels. Do not redesign, recolor, relabel, add or remove any part of the product. The product must be the same item the user selected, not a similar-looking substitute. Only the camera, pose and environment may change.`,
      ...(desc ? [`Product description (use this to render it correctly): ${desc}`] : []),
      ``,
      out,
    ].join('\n')
  }
  const cameraPrompt = cameraAngle ? cameraPrompts[cameraAngle] : undefined
  if (cameraPrompt) out += `\n\nCAMERA ANGLE: ${cameraPrompt}`
  const themePrompt = theme ? themePrompts[theme] : undefined
  if (themePrompt) out += `\n\nVISUAL STYLE: ${themePrompt}`
  out += `\n\nSCENE ${sceneIndex + 1} OF ${sceneCount}: This clip is one shot in a continuous sequence. Keep the same subject, setting and lighting as the surrounding clips so the film flows seamlessly.`
  return out
}

/**
 * A plan is a single 5-second shot with its own image, prompt, and coverage.
 * The scenario is written for the whole film, then split into plans.
 */
export interface FilmPlan {
  /** Zero-based plan index within the film. */
  planIndex: number
  /** Total number of plans in the film. */
  totalPlans: number
  /** "SHOT i OF n" label for UI and job metadata. */
  label: string
  /** Coverage framing for this plan: wide | medium | close. */
  coverage: PlanCoverage
  /** Duration in seconds (always 5). */
  durationSeconds: 5
  /** The portion of the scenario text assigned to this plan. */
  scenarioText: string
  /** The portion of narration assigned to this plan, if any. */
  narrationText?: string
  /** The still image (first frame) URL for this plan, when generated. */
  imageUrl?: string
}

/**
 * Split a film's full scenario text into per-plan segments.
 *
 * The model is instructed to return exactly `planCount` sections separated by
 * the ===SCENE=== delimiter. We trust the delimiter first, then paragraph
 * breaks. Sentence-based splitting is intentionally removed — if the model
 * doesn't respect the delimiter, we let the caller detect the mismatch and
 * retry rather than inventing plans.
 */
export function splitScenarioIntoPlans(
  scenarioText: string,
  planCount: number,
): string[] {
  if (planCount <= 1) return [scenarioText.trim()]
  const cleaned = scenarioText.trim()
  if (!cleaned) return Array.from({ length: planCount }, () => '')

  // Primary: split by ===SCENE=== delimiters (the explicit contract with the model).
  const delimited = cleaned
    .split(/\r?\n?\s*===SCENE===\s*\r?\n?/i)
    .map((s) => s.trim())
    .filter(Boolean)
  if (delimited.length === planCount) return delimited

  // Secondary: split by paragraph breaks.
  const paragraphs = cleaned.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean)
  if (paragraphs.length === planCount) return paragraphs

  // Mismatch — return raw as single segment so caller can detect and handle it.
  return [cleaned]
}

/**
 * Split the full film narration across plans proportionally. Narration is
 * written for the whole film as one coherent text, then divided so each plan
 * gets its portion naturally.
 */
export function splitNarrationAcrossPlans(
  fullNarration: string | undefined,
  planCount: number,
): (string | undefined)[] {
  if (!fullNarration || planCount <= 1) {
    return Array.from({ length: planCount }, (_, i) => (i === 0 ? fullNarration : undefined))
  }
  const cleaned = fullNarration.trim()
  if (!cleaned) return Array.from({ length: planCount }, () => undefined)

  // Try splitting by sentences.
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean)
  if (sentences.length >= planCount) {
    const result: (string | undefined)[] = Array.from({ length: planCount }, () => undefined)
    let s = 0
    for (let i = 0; i < planCount; i++) {
      const targetEnd = Math.floor((sentences.length * (i + 1)) / planCount)
      const chunk = sentences.slice(s, targetEnd).join(' ')
      result[i] = chunk || undefined
      s = targetEnd
    }
    return result
  }

  // Not enough sentences: give everything to plan 0, none to others.
  const result: (string | undefined)[] = Array.from({ length: planCount }, () => undefined)
  result[0] = cleaned
  return result
}

/**
 * Build the per-plan image prompt: a fixed identity block plus per-plan
 * coverage and continuity.
 */
export function buildPlanImagePrompt(
  plan: FilmPlan,
  selections: FilmSelections,
  cameraPrompts: Record<string, string>,
  themePrompts: Record<string, string>,
  noText?: boolean,
): string {
  let out = plan.scenarioText
  const { product, character, cameraAngle, theme } = selections
  if (product && character) {
    out += `\n\nREFERENCE IMAGES (use BOTH in this shot):\n- PRODUCT image: ${product.url}\n- CHARACTER image: ${character.url}\nThe product and the character MUST appear together prominently in the same shot. Show the character interacting with or holding the product.`
  } else if (product) {
    out += `\n\nREFERENCE PRODUCT image: ${product.url}\nThis product MUST appear prominently in this shot.`
  } else if (character) {
    out += `\n\nREFERENCE CHARACTER image: ${character.url}\nThis character MUST appear prominently in this shot.`
  }
  const cameraPrompt = cameraAngle ? cameraPrompts[cameraAngle] : undefined
  if (cameraPrompt) out += `\n\nCAMERA ANGLE: ${cameraPrompt}`
  const themePrompt = theme ? themePrompts[theme] : undefined
  if (themePrompt) out += `\n\nVISUAL STYLE: ${themePrompt}`
  out += `\n\n${plan.label}: This is one shot in a continuous sequence. Coverage: ${plan.coverage} shot. Keep the same subject, setting and lighting as the surrounding shots so the film flows seamlessly.`
  if (noText) {
    out += `\n\nStrictly no text of any kind in the image: no words, letters, numbers, captions, subtitles, signage text, logos, or watermarks.`
  }
  return out
}

/**
 * Build the per-plan video prompt: identity lock (product + character) plus
 * camera + theme + continuity + coverage.
 */
export function buildPlanClipPrompt(
  plan: FilmPlan,
  selections: FilmSelections,
  cameraPrompts: Record<string, string>,
  themePrompts: Record<string, string>,
  characterDescription?: string,
): string {
  let out = plan.scenarioText
  const { product, character, cameraAngle, theme } = selections
  if (characterDescription) {
    out = [
      `CHARACTER IDENTITY LOCK (highest priority): The main character is fixed and must stay identical in every shot:`,
      characterDescription,
      `Keep the exact same face, hair, body, proportions and the EXACT same outfit -- same clothing items, colors, logos/prints, trousers, shoes and accessories. Do not change, restyle, recolor, add or remove any clothing or accessory, and do not redesign the character. Only the pose, action, camera and environment may change.`,
      ``,
      out,
    ].join('\n')
  }
  if (product) {
    const name = product.title?.trim()
    const desc = product.description?.trim()
    out = [
      `PRODUCT IDENTITY LOCK (highest priority): The advertised product${name ? ` ("${name}")` : ''} is fixed and must stay identical in every shot, matching the provided product reference image exactly.`,
      `Keep the exact same product shape, geometry, materials, colors, branding, logos, text and labels. Do not redesign, recolor, relabel, add or remove any part of the product. The product must be the same item the user selected, not a similar-looking substitute. Only the camera, pose and environment may change.`,
      ...(desc ? [`Product description (use this to render it correctly): ${desc}`] : []),
      ``,
      out,
    ].join('\n')
  }
  const cameraPrompt = cameraAngle ? cameraPrompts[cameraAngle] : undefined
  if (cameraPrompt) out += `\n\nCAMERA ANGLE: ${cameraPrompt}`
  const themePrompt = theme ? themePrompts[theme] : undefined
  if (themePrompt) out += `\n\nVISUAL STYLE: ${themePrompt}`
  out += `\n\n${plan.label}: This clip is one shot in a continuous sequence. Coverage: ${plan.coverage} shot. Keep the same subject, setting and lighting as the surrounding clips so the film flows seamlessly.`
  return out
}

/**
 * Build plan objects from a total duration, scenario text, and optional narration.
 * This is the single source of truth for how a film becomes a sequence of plans.
 *
 * The model must return exactly `planCount` sections separated by ===SCENE===.
 * If the returned section count doesn't match, we throw a readable error so the
 * caller can retry or surface it to the user.
 */
export function buildFilmPlans(
  totalDurationSeconds: number,
  scenarioText: string,
  fullNarration: string | undefined,
): FilmPlan[] {
  const planCount = expectedPlanCount(totalDurationSeconds)
  const coverage = computePlanCoverage(totalDurationSeconds)
  const scenarioParts = splitScenarioIntoPlans(scenarioText, planCount)

  if (scenarioParts.length !== planCount) {
    throw new Error(
      `The AI returned ${scenarioParts.length} plan section${scenarioParts.length === 1 ? '' : 's'} for a ${totalDurationSeconds}-second film, but ${planCount} sections are required. Please try again.`,
    )
  }

  const narrationParts = splitNarrationAcrossPlans(fullNarration, planCount)

  return Array.from({ length: planCount }, (_, i) => ({
    planIndex: i,
    totalPlans: planCount,
    label: `SHOT ${i + 1} OF ${planCount}`,
    coverage: coverage[i] ?? 'medium',
    durationSeconds: 5 as const,
    scenarioText: scenarioParts[i] ?? '',
    narrationText: narrationParts[i],
  }))
}

/**
 * Compute credit consumption for a plan-based film. Each plan is one job.
 * For now, credits = planCount * cost_per_5s_job. This is shown to the user
 * before production starts.
 */
export function computePlanCredits(planCount: number, costPerJob = 1): number {
  return planCount * costPerJob
}

/**
 * Verify that the plan structure is valid: plan count matches duration/5,
 * every plan is 5 seconds, and the total equals the chosen duration.
 */
export function validateFilmPlans(
  totalDurationSeconds: number,
  plans: FilmPlan[],
): { valid: boolean; error?: string } {
  const expectedCount = expectedPlanCount(totalDurationSeconds)
  if (plans.length !== expectedCount) {
    return {
      valid: false,
      error: `Expected ${expectedCount} plans for ${totalDurationSeconds}s, got ${plans.length}`,
    }
  }
  const totalPlanSeconds = plans.reduce((acc, p) => acc + p.durationSeconds, 0)
  if (totalPlanSeconds !== totalDurationSeconds) {
    return {
      valid: false,
      error: `Plan durations sum to ${totalPlanSeconds}s, expected ${totalDurationSeconds}s`,
    }
  }
  const allFiveSeconds = plans.every((p) => p.durationSeconds === 5)
  if (!allFiveSeconds) {
    return { valid: false, error: 'Every plan must be exactly 5 seconds' }
  }
  return { valid: true }
}

/** Reference image URLs to attach to image/video generation, in a stable order:
 * character first, then product. Deduplicated, capped at the provider limit.
 */
export function buildReferenceImageUrls(
  anchors: Array<string | null | undefined>,
  limit = 3,
): string[] | undefined {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const u of anchors) {
    if (typeof u !== 'string' || !u) continue
    if (seen.has(u)) continue
    seen.add(u)
    urls.push(u)
  }
  return urls.length > 0 ? urls.slice(0, limit) : undefined
}

/**
 * Decide whether a scene produces narration. When the wizard chose "Without
 * narration" (withNarration === false), no narration/voiceover is produced for
 * any clip regardless of what the scene text contains. Otherwise the narration
 * is the de-duplicated spoken lines extracted from the scene text.
 */
export function resolveSceneNarration(
  sceneText: string,
  withNarration: boolean | undefined,
  extract: (prompt: string | null | undefined) => string[],
): string | undefined {
  if (withNarration === false) return undefined
  const lines = extract(sceneText)
  return lines.length > 0 ? lines.join('\n') : undefined
}

/**
 * The "Approve & Make Film" button must stay disabled until EVERY required
 * scene image is ready. A single missing image (or a failed image) blocks
 * approval so the user cannot render a film with incomplete scenes.
 */
export function canApproveFilm(images: Array<string | undefined>): boolean {
  return images.length > 0 && images.every((u) => typeof u === 'string' && u.length > 0)
}

/**
 * Sanitize a product title for use in scenario / narration / clip prompts and
 * the picker label, so auto-generated upload/version suffixes never leak into
 * the story text.
 *
 * Removes ONLY clear auto-generated trailing markers:
 *   - a trailing file extension (e.g. ".png", ".jpg"),
 *   - a zero-padded trailing number with an optional separator ("001", "_001",
 *     "-001", " 001"),
 *   - a trailing duplicate marker like "(1)", "(2)", "-copy", " copy".
 *
 * Meaningful numbers are PRESERVED: "iPhone 15", "Rebar #4", "3M", "ISO 9001",
 * "stirup" (no suffix). The raw database title, id, storage path, url and image
 * are never modified -- only the derived display/scenario name is cleaned.
 *
 * If the result is empty, falls back to the original title (or "Selected
 * Product" when the title is null/blank).
 */
export function sanitizeProductName(title: string | null | undefined): string {
  const raw = (title ?? '').trim()
  if (!raw) return 'Selected Product'

  let out = raw
  // Strip a trailing file extension (e.g. "stirup001.png" -> "stirup001").
  out = out.replace(/\.(png|jpe?g|webp|gif|bmp|svg|heic|heif|avif)$/i, '').trim()
  // Strip a trailing duplicate marker: "(1)", "(2)", "-copy", " copy".
  out = out.replace(/\s*\(\d+\)\s*$/i, '').trim()
  out = out.replace(/\s*[-–]\s*(copy|duplicate|dup)\s*$/i, '').trim()
  out = out.replace(/\s+(copy|duplicate|dup)\s*$/i, '').trim()
  // Strip a trailing ZERO-PADDED auto number ("001", "_001", "-001", " 001").
  // Only numbers that START with a leading zero are treated as auto upload/version
  // counters. Meaningful numbers like "iPhone 15", "Rebar #4", "3M", "ISO 9001"
  // are preserved because they do not start with a leading zero. The negative
  // lookbehind ensures the zero is the FIRST digit of the trailing number token,
  // so "9001" (which starts with 9) is never stripped.
  out = out.replace(/\s*[_-]?\s*(?<![\d.])0\d+\s*$/i, '').trim()

  return out.trim() || raw
}
