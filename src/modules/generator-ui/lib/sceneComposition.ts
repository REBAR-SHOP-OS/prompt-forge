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
  /** Product reference URL (Image 1 / base). */
  productUrl?: string | null
  /** Character reference URL (Image 2 / reference). */
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
 * The product is Image 1 (the base) and the character is Image 2 (the
 * reference), exactly as Product Ad's buildFirstFrame does. The scene text
 * supplies the environment and events; camera/theme/no-text/character-sheet are
 * appended as directives. Returns null when there is no product+character pair
 * to compose (callers should fall back to the single-identity generate path).
 */
export function buildSceneCompositionPrompt(input: SceneCompositionInput): string | null {
  const { sceneText, productUrl, characterUrl } = input
  if (!productUrl || !characterUrl) return null

  const lines: string[] = [
    'Image 1 is the PRODUCT. Image 2 is the on-screen CHARACTER / presenter.',
    'Compose a single photorealistic scene image for a film in which the character is presenting, holding, or interacting with the product, with the product clearly visible as the hero of the shot.',
    `The scene and its events are: ${sceneText.trim()}`,
    "Keep the character's face, hair, wardrobe and body identical to image 2, and keep the product's exact shape, colors and label from image 1.",
    'The product and the character MUST appear together prominently in the same shot, interacting with each other.',
  ]

  if (input.characterSheet) {
    lines.push(
      'The character reference (image 2) is a MULTI-VIEW CHARACTER SHEET: every view shows the SAME one person. Preserve that exact person (same face, hair, skin tone, body type, and outfit) — never substitute a different person.',
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
