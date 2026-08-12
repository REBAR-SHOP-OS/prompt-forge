import { describe, it, expect } from 'vitest'
import {
  expectedSceneCount,
  computeClipDurations,
  sumClipDurations,
  buildScenarioPrompt,
  buildSceneImagePrompt,
  buildClipPrompt,
  buildReferenceImageUrls,
  resolveSceneNarration,
  canApproveFilm,
  FILM_DURATIONS,
} from './makeFilmWizard'

const CAMERA: Record<string, string> = {
  'close-up': 'Close-up shot, intimate framing.',
  'wide-shot': 'Wide shot, full body or environment visible.',
}
const THEME: Record<string, string> = {
  cinematic: 'Cinematic film look, dramatic lighting.',
  bright: 'Bright, clean, well-lit.',
}

describe('expectedSceneCount', () => {
  it('maps each duration to the correct scene count', () => {
    expect(expectedSceneCount(5)).toBe(1)
    expect(expectedSceneCount(10)).toBe(1)
    expect(expectedSceneCount(15)).toBe(1)
    expect(expectedSceneCount(30)).toBe(2)
    expect(expectedSceneCount(45)).toBe(3)
    expect(expectedSceneCount(60)).toBe(4)
    expect(expectedSceneCount(90)).toBe(6)
    expect(expectedSceneCount(135)).toBe(9)
  })
})

describe('computeClipDurations', () => {
  it('splits every supported duration into contract-valid clips', () => {
    const cases: Record<number, number[]> = {
      5: [5],
      10: [10],
      15: [15],
      30: [15, 15],
      45: [15, 15, 15],
      60: [15, 15, 15, 15],
      90: [15, 15, 15, 15, 15, 15],
      135: [15, 15, 15, 15, 15, 15, 15, 15, 15],
    }
    for (const duration of FILM_DURATIONS) {
      const clips = computeClipDurations(duration)
      expect(clips).toEqual(cases[duration])
      // Every clip is a valid contract duration.
      for (const c of clips) expect([5, 10, 15]).toContain(c)
      // Sum of clip durations equals the chosen time.
      expect(sumClipDurations(clips)).toBe(duration)
    }
  })
})

describe('buildScenarioPrompt', () => {
  it('carries product + character + camera + theme into the scenario prompt', () => {
    const out = buildScenarioPrompt(
      'A story about a coffee maker.',
      {
        product: { id: 'p1', title: 'AeroPress', url: 'https://x/p.png' },
        character: { id: 'c1', title: 'Barista', url: 'https://x/c.png' },
        cameraAngle: 'close-up',
        theme: 'cinematic',
      },
      CAMERA,
      THEME,
    )
    expect(out).toContain('AeroPress')
    expect(out).toContain('Barista')
    expect(out).toContain('https://x/p.png')
    expect(out).toContain('https://x/c.png')
    expect(out).toContain('Close-up shot')
    expect(out).toContain('Cinematic film look')
  })

  it('handles product-only and character-only selections', () => {
    const prod = buildScenarioPrompt('x', { product: { id: 'p', title: 'P', url: 'u' } }, CAMERA, THEME)
    expect(prod).toContain('PRODUCT TO FEATURE')
    expect(prod).not.toContain('CHARACTER TO FEATURE')
    const char = buildScenarioPrompt('x', { character: { id: 'c', title: 'C', url: 'u' } }, CAMERA, THEME)
    expect(char).toContain('CHARACTER TO FEATURE')
    expect(char).not.toContain('PRODUCT TO FEATURE')
  })
})

describe('buildSceneImagePrompt', () => {
  it('uses a fixed identity block + per-scene continuity block', () => {
    const out = buildSceneImagePrompt(
      'Scene text',
      {
        product: { id: 'p', title: 'P', url: 'https://x/p.png' },
        character: { id: 'c', title: 'C', url: 'https://x/c.png' },
        cameraAngle: 'wide-shot',
        theme: 'bright',
      },
      CAMERA,
      THEME,
      1,
      3,
      true,
    )
    expect(out).toContain('https://x/p.png')
    expect(out).toContain('https://x/c.png')
    expect(out).toContain('Wide shot')
    expect(out).toContain('Bright, clean')
    expect(out).toContain('SCENE 2 OF 3')
    expect(out).toContain('Strictly no text')
  })

  it('omits the no-text directive when not requested', () => {
    const out = buildSceneImagePrompt('t', {}, CAMERA, THEME, 0, 1, false)
    expect(out).not.toContain('Strictly no text')
  })
})

describe('buildClipPrompt', () => {
  it('applies identity locks, camera, theme and continuity to every clip', () => {
    const out = buildClipPrompt(
      'Raw scene',
      {
        product: { id: 'p', title: 'P', url: 'u', description: 'desc' },
        character: { id: 'c', title: 'C', url: 'u' },
        cameraAngle: 'close-up',
        theme: 'cinematic',
      },
      CAMERA,
      THEME,
      0,
      2,
      'A tall barista',
    )
    expect(out).toContain('CHARACTER IDENTITY LOCK')
    expect(out).toContain('A tall barista')
    expect(out).toContain('PRODUCT IDENTITY LOCK')
    expect(out).toContain('desc')
    expect(out).toContain('Close-up shot')
    expect(out).toContain('Cinematic film look')
    expect(out).toContain('SCENE 1 OF 2')
  })
})

describe('buildReferenceImageUrls', () => {
  it('dedupes, orders character-first, and caps at the limit', () => {
    const urls = buildReferenceImageUrls(['https://x/c.png', 'https://x/p.png', 'https://x/c.png', 'https://x/p2.png'], 2)
    expect(urls).toEqual(['https://x/c.png', 'https://x/p.png'])
  })
  it('returns undefined when there are no urls', () => {
    expect(buildReferenceImageUrls([null, undefined, ''])).toBeUndefined()
  })
})

describe('resolveSceneNarration', () => {
  const extract = (p: string | null | undefined) => {
    if (!p) return []
    return p.split('\n').filter((l) => l.startsWith('Narration:'))
  }
  it('produces narration when withNarration is on and the scene has spoken lines', () => {
    const out = resolveSceneNarration('Action.\nNarration: Buy now.', true, extract)
    expect(out).toBe('Narration: Buy now.')
  })
  it('produces NO narration when withNarration is off, even if the scene has lines', () => {
    const out = resolveSceneNarration('Action.\nNarration: Buy now.', false, extract)
    expect(out).toBeUndefined()
  })
  it('produces no narration when the scene has no spoken lines', () => {
    expect(resolveSceneNarration('Just action.', true, extract)).toBeUndefined()
  })
})

describe('canApproveFilm', () => {
  it('is false when any required image is missing', () => {
    expect(canApproveFilm(['https://x/1.png', undefined, 'https://x/3.png'])).toBe(false)
  })
  it('is false when there are no images at all', () => {
    expect(canApproveFilm([])).toBe(false)
  })
  it('is true only when every scene image is present', () => {
    expect(canApproveFilm(['https://x/1.png', 'https://x/2.png', 'https://x/3.png'])).toBe(true)
  })
})
