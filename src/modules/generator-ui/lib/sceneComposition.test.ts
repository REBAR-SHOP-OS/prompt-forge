import { describe, it, expect } from 'vitest'
import {
  MAX_SCENE_REFERENCE_IMAGES,
  buildSceneCompositionPrompt,
  buildSceneEditRequestBody,
  buildSceneGenerateRequestBody,
  capProductReferenceUrls,
} from './sceneComposition'

describe('buildSceneCompositionPrompt', () => {
  it('returns null when there is no product+character pair to compose', () => {
    expect(buildSceneCompositionPrompt({ sceneText: 'A scene' })).toBeNull()
    expect(buildSceneCompositionPrompt({ sceneText: 'A scene', productUrls: ['https://x/p.png'] })).toBeNull()
    expect(buildSceneCompositionPrompt({ sceneText: 'A scene', characterUrl: 'https://x/c.png' })).toBeNull()
  })

  it('composes product + character into a single frame with the scene text', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'The barista pours coffee at sunrise.',
      productUrls: ['https://x/p.png'],
      characterUrl: 'https://x/c.png',
    })
    expect(out).not.toBeNull()
    expect(out).toContain('Image 1 is the PRODUCT. Image 2 is the on-screen CHARACTER / presenter.')
    expect(out).toContain('The scene and its events are: The barista pours coffee at sunrise.')
    expect(out).toContain('Keep the character\'s face, hair, wardrobe and body identical to image 2')
    expect(out).toContain('keep the product\'s exact shape, colors and label from image 1')
    expect(out).toContain('MUST appear together prominently in the same shot')
  })

  it('appends camera and theme directives when provided', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'A scene',
      productUrls: ['https://x/p.png'],
      characterUrl: 'https://x/c.png',
      cameraStyle: 'Close-up shot, intimate framing.',
      theme: 'Cinematic film look, dramatic lighting.',
    })
    expect(out).toContain('CAMERA ANGLE: Close-up shot, intimate framing.')
    expect(out).toContain('VISUAL STYLE: Cinematic film look, dramatic lighting.')
  })

  it('adds the no-text directive when requested', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'A scene',
      productUrls: ['https://x/p.png'],
      characterUrl: 'https://x/c.png',
      noText: true,
    })
    expect(out).toContain('MUST NOT contain any added text, captions, titles, subtitles')
    expect(out).toContain('The only writing allowed is the product\'s own real label')
  })

  it('omits the no-text directive when not requested', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'A scene',
      productUrls: ['https://x/p.png'],
      characterUrl: 'https://x/c.png',
    })
    expect(out).not.toContain('MUST NOT contain any added text')
  })

  it('treats a character sheet as a single identity', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'A scene',
      productUrls: ['https://x/p.png'],
      characterUrl: 'https://x/c.png',
      characterSheet: true,
    })
    expect(out).toContain('MULTI-VIEW CHARACTER SHEET')
    expect(out).toContain('never substitute a different person')
  })

  it('does not add the character-sheet note for a plain character', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'A scene',
      productUrls: ['https://x/p.png'],
      characterUrl: 'https://x/c.png',
      characterSheet: false,
    })
    expect(out).not.toContain('MULTI-VIEW CHARACTER SHEET')
  })

  it('trims the scene text before embedding it', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: '  A scene with padding.  ',
      productUrls: ['https://x/p.png'],
      characterUrl: 'https://x/c.png',
    })
    expect(out).toContain('The scene and its events are: A scene with padding.')
  })

  // A product photo folder holds every angle the user saved for one product.
  // A single generated shot can only show one of them, but the model should
  // still be grounded by every angle at once — this pins that the composition
  // text and the reference count both reflect the full group, not one angle.
  it('references every grouped product angle, not just the first, when composing multiple views', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'A scene',
      productUrls: ['https://x/front.png', 'https://x/side.png', 'https://x/back.png'],
      characterUrl: 'https://x/c.png',
    })
    expect(out).toContain('Images 1-3 are different angles of the SAME PRODUCT. Image 4 is the on-screen CHARACTER / presenter.')
    expect(out).toContain('identical to image 4')
    expect(out).toContain('from images 1-3')
  })
})

describe('buildSceneEditRequestBody reaches the generation request as one identity', () => {
  it('sends every grouped product angle plus the character to ai-image-edit, product-first then character', () => {
    const body = buildSceneEditRequestBody({
      prompt: 'compose it',
      productUrls: ['https://x/front.png', 'https://x/side.png', 'https://x/back.png'],
      characterUrl: 'https://x/character.png',
      characterSheet: true,
      aspectRatio: '16:9',
    })
    // The full grouped set reaches the request — not one rotated URL.
    expect(body.imageUrls).toEqual([
      'https://x/front.png',
      'https://x/side.png',
      'https://x/back.png',
      'https://x/character.png',
    ])
    expect(body.referenceRoles).toEqual(['product', 'product', 'product', 'character'])
    expect(body.referenceCharacterSheets).toEqual([false, false, false, true])
    expect(body.aspectRatio).toBe('16:9')
  })

  it('drops falsy URLs and omits aspectRatio when absent', () => {
    const body = buildSceneEditRequestBody({
      prompt: 'compose it',
      productUrls: ['https://x/front.png', ''],
      characterUrl: 'https://x/character.png',
      aspectRatio: null,
    })
    expect(body.imageUrls).toEqual(['https://x/front.png', 'https://x/character.png'])
    expect(body.aspectRatio).toBeUndefined()
  })
})

describe('buildSceneGenerateRequestBody reaches the generation request as one identity', () => {
  it('sends every grouped product angle to ai-image-generate for a product-only scene', () => {
    const body = buildSceneGenerateRequestBody({
      prompt: 'render it',
      productUrls: ['https://x/front.png', 'https://x/side.png'],
      aspectRatio: '9:16',
    })
    expect(body.referenceImageUrls).toEqual(['https://x/front.png', 'https://x/side.png'])
    expect(body.referenceRoles).toEqual(['product', 'product'])
    expect(body.referenceCharacterSheets).toEqual([false, false])
  })

  it('appends the character after every product angle when both are present', () => {
    const body = buildSceneGenerateRequestBody({
      prompt: 'render it',
      productUrls: ['https://x/front.png', 'https://x/side.png'],
      characterUrl: 'https://x/character.png',
      characterSheet: true,
      aspectRatio: '1:1',
    })
    expect(body.referenceImageUrls).toEqual(['https://x/front.png', 'https://x/side.png', 'https://x/character.png'])
    expect(body.referenceRoles).toEqual(['product', 'product', 'character'])
    expect(body.referenceCharacterSheets).toEqual([false, false, true])
  })

  it('supports a character-only scene with no product angles', () => {
    const body = buildSceneGenerateRequestBody({
      prompt: 'render it',
      productUrls: [],
      characterUrl: 'https://x/character.png',
      aspectRatio: '1:1',
    })
    expect(body.referenceImageUrls).toEqual(['https://x/character.png'])
    expect(body.referenceRoles).toEqual(['character'])
  })
})

// Regression coverage for the live 400 "At most 6 reference images are allowed."
// A grouped product folder with six or more saved angles plus a selected
// character produced seven references, which the backend rejected outright and
// every Step 3 preview card showed "No image — regenerate". The cap now lives
// at the caller boundary as a pure, deterministic helper.
describe('reference-image cap at the caller boundary', () => {
  const angles = (n: number) => Array.from({ length: n }, (_, i) => `https://x/a${i}.png`)

  it('matches the shared backend MAX_REFERENCE_IMAGES constant', async () => {
    const shared = await import('../../../../supabase/functions/_shared/identity-eval')
    expect(MAX_SCENE_REFERENCE_IMAGES).toBe(shared.MAX_REFERENCE_IMAGES)
  })

  it('keeps the character slot when the product folder is already at the cap', () => {
    const body = buildSceneEditRequestBody({
      prompt: 'compose it',
      productUrls: angles(6),
      characterUrl: 'https://x/character.png',
      characterSheet: true,
      aspectRatio: '16:9',
    })
    expect(body.imageUrls).toHaveLength(MAX_SCENE_REFERENCE_IMAGES)
    expect(body.imageUrls[0]).toBe('https://x/a0.png')
    expect(body.imageUrls.at(-1)).toBe('https://x/character.png')
    expect(body.referenceRoles).toEqual(['product', 'product', 'product', 'product', 'product', 'character'])
    expect(body.referenceCharacterSheets).toEqual([false, false, false, false, false, true])
  })

  it('never exceeds the cap even for a very large folder, and stays metadata-aligned', () => {
    const body = buildSceneEditRequestBody({
      prompt: 'compose it',
      productUrls: angles(20),
      characterUrl: 'https://x/character.png',
      aspectRatio: '9:16',
    })
    expect(body.imageUrls).toHaveLength(MAX_SCENE_REFERENCE_IMAGES)
    expect(body.referenceRoles).toHaveLength(body.imageUrls.length)
    expect(body.referenceCharacterSheets).toHaveLength(body.imageUrls.length)
  })

  it('leaves a product-only request at or below the cap untouched', () => {
    const under = buildSceneGenerateRequestBody({ prompt: 'p', productUrls: angles(3), aspectRatio: '1:1' })
    expect(under.referenceImageUrls).toEqual(angles(3))
    const atCap = buildSceneGenerateRequestBody({ prompt: 'p', productUrls: angles(6), aspectRatio: '1:1' })
    expect(atCap.referenceImageUrls).toEqual(angles(6))
    expect(atCap.referenceRoles).toHaveLength(6)
    expect(atCap.referenceCharacterSheets).toHaveLength(6)
  })

  it('bounds the generate path too when a character is present', () => {
    const body = buildSceneGenerateRequestBody({
      prompt: 'p',
      productUrls: angles(9),
      characterUrl: 'https://x/character.png',
      characterSheet: true,
      aspectRatio: '1:1',
    })
    expect(body.referenceImageUrls).toHaveLength(MAX_SCENE_REFERENCE_IMAGES)
    expect(body.referenceRoles.at(-1)).toBe('character')
    expect(body.referenceCharacterSheets.at(-1)).toBe(true)
  })

  it('keeps at least the primary product angle', () => {
    expect(capProductReferenceUrls(angles(3), true)).toContain('https://x/a0.png')
    expect(capProductReferenceUrls([], true)).toEqual([])
    expect(capProductReferenceUrls(['https://x/a0.png', null, undefined, 'https://x/a1.png'], false)).toEqual([
      'https://x/a0.png',
      'https://x/a1.png',
    ])
  })

  it('labels only the product angles actually sent in the composition prompt', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'A scene',
      productUrls: angles(8),
      characterUrl: 'https://x/character.png',
    })
    expect(out).toContain('Images 1-5 are different angles of the SAME PRODUCT. Image 6 is the on-screen CHARACTER / presenter.')
    expect(out).toContain('identical to image 6')
    expect(out).toContain('from images 1-5')
  })
})
