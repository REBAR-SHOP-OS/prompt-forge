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
 *   5→1, 10→1, 15→1, 30→2, 45→3, 60→4, 90→6, 135→9
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
 *   5s  → [5]
 *   10s → [10]
 *   15s → [15]
 *   30s → [15, 15]
 *   45s → [15, 15, 15]
 *   60s → [15, 15, 15, 15]
 *   90s → [15, 15, 15, 15, 15, 15]
 *   135s→ [15, 15, 15, 15, 15, 15, 15, 15, 15]
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

/** Sum of clip durations — used to assert the split equals the chosen time. */
export function sumClipDurations(clips: ClipDuration[]): number {
  return clips.reduce((acc, c) => acc + c, 0)
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
      `Keep the exact same face, hair, body, proportions and the EXACT same outfit — same clothing items, colors, logos/prints, trousers, shoes and accessories. Do not change, restyle, recolor, add or remove any clothing or accessory, and do not redesign the character. Only the pose, action, camera and environment may change.`,
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
 * Reference image URLs to attach to image/video generation, in a stable order:
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
