import { describe, it, expect } from 'vitest'
import { buildSceneCompositionPrompt } from './sceneComposition'

describe('buildSceneCompositionPrompt', () => {
  it('returns null when there is no product+character pair to compose', () => {
    expect(buildSceneCompositionPrompt({ sceneText: 'A scene' })).toBeNull()
    expect(buildSceneCompositionPrompt({ sceneText: 'A scene', productUrl: 'https://x/p.png' })).toBeNull()
    expect(buildSceneCompositionPrompt({ sceneText: 'A scene', characterUrl: 'https://x/c.png' })).toBeNull()
  })

  it('composes product + character into a single frame with the scene text', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'The barista pours coffee at sunrise.',
      productUrl: 'https://x/p.png',
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
      productUrl: 'https://x/p.png',
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
      productUrl: 'https://x/p.png',
      characterUrl: 'https://x/c.png',
      noText: true,
    })
    expect(out).toContain('MUST NOT contain any added text, captions, titles, subtitles')
    expect(out).toContain('The only writing allowed is the product\'s own real label')
  })

  it('omits the no-text directive when not requested', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'A scene',
      productUrl: 'https://x/p.png',
      characterUrl: 'https://x/c.png',
    })
    expect(out).not.toContain('MUST NOT contain any added text')
  })

  it('treats a character sheet as a single identity', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'A scene',
      productUrl: 'https://x/p.png',
      characterUrl: 'https://x/c.png',
      characterSheet: true,
    })
    expect(out).toContain('MULTI-VIEW CHARACTER SHEET')
    expect(out).toContain('never substitute a different person')
  })

  it('does not add the character-sheet note for a plain character', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: 'A scene',
      productUrl: 'https://x/p.png',
      characterUrl: 'https://x/c.png',
      characterSheet: false,
    })
    expect(out).not.toContain('MULTI-VIEW CHARACTER SHEET')
  })

  it('trims the scene text before embedding it', () => {
    const out = buildSceneCompositionPrompt({
      sceneText: '  A scene with padding.  ',
      productUrl: 'https://x/p.png',
      characterUrl: 'https://x/c.png',
    })
    expect(out).toContain('The scene and its events are: A scene with padding.')
  })
})
