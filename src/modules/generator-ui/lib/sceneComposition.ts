// Shared composition logic for the "Make Full Film" wizard scene images.
//
// Product Ad (ProductAdDialog.buildFirstFrame) composes the product + character
// into a single opening frame by calling the `ai-image-edit` edge function with
// `imageUrls: [product, character]`. That edge function treats Image 1 as the
// BASE image and the remaining images as visual references, and COMPOSITES them
// into one frame — which reliably keeps both identities.
//
// Make Full Film previously used `ai-image-generate` with the references as
// "identity anchors to preserve" in a freshly generated image, which does NOT
// composite product + character the same way and so produced inconsistent
// results. This module owns the shared, testable composition prompt so both
// paths (and any future caller) build the scene image the same way Product Ad
// does, while the scene's environment/events still come from the scenario text.
//
// Kept free of React / Supabase / DOM so it can be unit-tested directly.

export interface SceneCompositionInput {
  /** The scene's scenario text (environment + events). */
  sceneText: string
  /**
   * Product reference URLs — every grouped angle of one product, in stable
   * order. All of them go into the composed image's reference set; the FIRST
   * one is the "Image 1" / primary product angle referenced by name in the
   * text prompt below.
   */
  productUrls?: readonly string[] | null
  /** Character reference URL (last image / reference). */
  characterUrl?: string | null
  /** Camera style directive (e.g. "Close-up shot, intimate framing."). */
  cameraStyle?: string
  /** Visual theme directive (e.g. "Cinematic film look, dramatic lighting."). */
  theme?: string
  /** When true, the composed frame must contain no text of any kind. */
  noText?: boolean
  /** When true, the character reference is a multi-view character sheet. */
  characterSheet?: boolean
}

/**
 * Build the `ai-image-edit` composition prompt for a Make Full Film scene.
 *
 * Every grouped product angle is composed alongside the character, exactly as
 * Product Ad's buildFirstFrame does for a single product image. The scene text
 * supplies the environment and events; camera/theme/no-text/character-sheet
 * are appended as directives. Returns null when there is no product+character
 * pair to compose (callers should fall back to the single-identity generate
 * path).
 */
export function buildSceneCompositionPrompt(input: SceneCompositionInput): string | null {
  const { sceneText, characterUrl } = input
  const productUrls = (input.productUrls ?? []).filter((url): url is string => !!url)
  if (productUrls.length === 0 || !characterUrl) return null

  const characterImageIndex = productUrls.length + 1
  const productImageLabel = productUrls.length > 1 ? `images 1-${productUrls.length}` : 'image 1'

  const lines: string[] = [
    productUrls.length > 1
      ? `Images 1-${productUrls.length} are different angles of the SAME PRODUCT. Image ${characterImageIndex} is the on-screen CHARACTER / presenter.`
      : 'Image 1 is the PRODUCT. Image 2 is the on-screen CHARACTER / presenter.',
    'Compose a single photorealistic scene image for a film in which the character is presenting, holding, or interacting with the product, with the product clearly visible as the hero of the shot.',
    `The scene and its events are: ${sceneText.trim()}`,
    `Keep the character's face, hair, wardrobe and body identical to image ${characterImageIndex}, and keep the product's exact shape, colors and label from ${productImageLabel}.`,
    'The product and the character MUST appear together prominently in the same shot, interacting with each other.',
  ]

  if (input.characterSheet) {
    lines.push(
      `The character reference (image ${characterImageIndex}) is a MULTI-VIEW CHARACTER SHEET: every view shows the SAME one person. Preserve that exact person (same face, hair, skin tone, body type, and outfit) — never substitute a different person.`,
    )
  }
  if (input.cameraStyle) {
    lines.push(`CAMERA ANGLE: ${input.cameraStyle}`)
  }
  if (input.theme) {
    lines.push(`VISUAL STYLE: ${input.theme}`)
  }
  if (input.noText) {
    lines.push(
      'The final image MUST NOT contain any added text, captions, titles, subtitles, slogans, typography, watermarks, logos, or UI overlays of any kind. Output a clean photographic frame only. The only writing allowed is the product\'s own real label that physically exists on the product in image 1.',
    )
  }

  return lines.join('\n')
}

export interface SceneEditRequestInput {
  prompt: string
  /** Every grouped product angle, in stable order. */
  productUrls: readonly string[]
  characterUrl: string
  characterSheet?: boolean
  aspectRatio: string | null
}

export interface SceneEditRequestBody {
  prompt: string
  imageUrls: string[]
  referenceRoles: string[]
  referenceCharacterSheets: boolean[]
  aspectRatio?: string
}

/**
 * Build the `ai-image-edit` request body for a product+character scene
 * composite: one 'product' role entry per grouped product angle (all of them
 * — this is generation-grounding, not identity-eval strictness, which is
 * handled separately by identity-eval's selectEvaluatedSpecs), the character
 * always last. This is the single source of truth for that array shape so the
 * UI call site and its tests share one definition of "reaches every angle".
 */
export function buildSceneEditRequestBody(input: SceneEditRequestInput): SceneEditRequestBody {
  const productUrls = input.productUrls.filter((url): url is string => !!url)
  return {
    prompt: input.prompt,
    imageUrls: [...productUrls, input.characterUrl],
    referenceRoles: [...productUrls.map(() => 'product'), 'character'],
    referenceCharacterSheets: [...productUrls.map(() => false), !!input.characterSheet],
    ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
  }
}

export interface SceneGenerateRequestInput {
  prompt: string
  /** Every grouped product angle, in stable order. */
  productUrls: readonly string[]
  /** Absent for a character-only scene. */
  characterUrl?: string | null
  characterSheet?: boolean
  aspectRatio: string
}

export interface SceneGenerateRequestBody {
  prompt: string
  aspectRatio: string
  referenceImageUrls: string[]
  referenceRoles: string[]
  referenceCharacterSheets: boolean[]
}

/**
 * Build the `ai-image-generate` request body for a single-identity scene
 * (product-only, with every grouped angle, or character-only). One 'product'
 * role entry per grouped product angle; the character is appended when
 * present.
 */
export function buildSceneGenerateRequestBody(input: SceneGenerateRequestInput): SceneGenerateRequestBody {
  const productUrls = input.productUrls.filter((url): url is string => !!url)
  const characterUrl = input.characterUrl ?? undefined
  return {
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    referenceImageUrls: [...productUrls, ...(characterUrl ? [characterUrl] : [])],
    referenceRoles: [...productUrls.map(() => 'product'), ...(characterUrl ? ['character'] : [])],
    referenceCharacterSheets: [...productUrls.map(() => false), ...(characterUrl ? [!!input.characterSheet] : [])],
  }
}
