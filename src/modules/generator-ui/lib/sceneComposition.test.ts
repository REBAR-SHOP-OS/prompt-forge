import { describe, it, expect } from 'vitest'
import { buildSceneCompositionPrompt, buildSceneEditRequestBody, buildSceneGenerateRequestBody } from './sceneComposition'

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
