import { describe, it, expect, vi } from 'vitest'
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
  isCharacterSheet,
  isMissingImageTypeColumnError,
  loadCharacterRows,
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

describe('isCharacterSheet', () => {
  it('treats explicit image_type character_sheet as a sheet regardless of title/url', () => {
    // An uploaded sheet with a non-standard title and a UUID storage key is
    // still detected because the explicit metadata is authoritative.
    expect(isCharacterSheet('character_sheet', 'My custom sheet', 'https://x/user/410b50ff-abc.png')).toBe(true)
  })
  it('treats explicit image_type character as a plain character even with a sheet-like title', () => {
    // A plain character explicitly marked as such is never misclassified, even
    // if its title happens to contain the "— sheet" marker.
    expect(isCharacterSheet('character', 'Sarah — sheet', 'https://x/user/410b50ff-abc.png')).toBe(false)
  })
  it('detects a legacy generated sheet by its "— sheet" title marker when image_type is null', () => {
    expect(isCharacterSheet(null, 'Sarah — sheet', 'https://x/1.png')).toBe(true)
  })
  it('detects a legacy generated sheet by its character-sheet- storage key when image_type is null', () => {
    expect(isCharacterSheet(null, 'My custom sheet', 'https://x/user/character-sheet-1712345-abc.png')).toBe(true)
  })
  it('detects a legacy generated sheet by storage key when title is null', () => {
    expect(isCharacterSheet(null, null, 'https://x/user/character-sheet-1712345-abc.png')).toBe(true)
  })
  it('does not treat a legacy plain character as a sheet', () => {
    expect(isCharacterSheet(null, 'Sarah', 'https://x/user/portrait-1712345-abc.png')).toBe(false)
  })
  it('does not treat a legacy plain character with no markers as a sheet', () => {
    expect(isCharacterSheet(null, 'Sarah', 'https://x/user/photo.png')).toBe(false)
  })
  it('does not treat a product as a sheet', () => {
    expect(isCharacterSheet(null, 'Sneaker', 'https://x/user/product-1.png')).toBe(false)
  })
  it('handles null image_type, title and url', () => {
    expect(isCharacterSheet(null, null, null)).toBe(false)
  })
})

describe('isMissingImageTypeColumnError', () => {
  it('matches the exact missing-column error for generator_user_images.image_type', () => {
    expect(
      isMissingImageTypeColumnError('column generator_user_images.image_type does not exist'),
    ).toBe(true)
  })
  it('matches a Postgres-style missing column message', () => {
    expect(
      isMissingImageTypeColumnError('column "generator_user_images.image_type" does not exist'),
    ).toBe(true)
  })
  it('does not match an auth error', () => {
    expect(isMissingImageTypeColumnError('JWT expired')).toBe(false)
  })
  it('does not match an RLS / permission error', () => {
    expect(isMissingImageTypeColumnError('new row violates row-level security policy')).toBe(false)
  })
  it('does not match a network / timeout error', () => {
    expect(isMissingImageTypeColumnError('fetch failed: connection refused')).toBe(false)
  })
  it('does not match a missing column on a different table', () => {
    expect(isMissingImageTypeColumnError('column generator_user_images.other does not exist')).toBe(false)
  })
  it('does not match null or empty message', () => {
    expect(isMissingImageTypeColumnError(null)).toBe(false)
    expect(isMissingImageTypeColumnError('')).toBe(false)
  })
})

describe('loadCharacterRows', () => {
  const row = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'r1',
    storage_path: 'user/character-sheet-1712345-abc.png',
    title: 'Sarah',
    category: 'character',
    ...over,
  })

  it('returns rows with image_type when the primary query succeeds', async () => {
    const query = vi.fn(async () => ({
      data: [row({ image_type: 'character_sheet' })],
      error: null,
    }))
    const { rows, fellBack } = await loadCharacterRows(query)
    expect(fellBack).toBe(false)
    expect(rows[0].imageType).toBe('character_sheet')
    // Primary query used the image_type column; no retry.
    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith('id, storage_path, title, category, image_type')
  })

  it('falls back once on missing-column and marks legacy rows imageType=null', async () => {
    const query = vi.fn()
    query
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'column generator_user_images.image_type does not exist' },
      })
      .mockResolvedValueOnce({
        data: [row()],
        error: null,
      })
    const { rows, fellBack } = await loadCharacterRows(query)
    expect(fellBack).toBe(true)
    expect(rows[0].imageType).toBeNull()
    // Exactly one retry with the legacy select (no image_type).
    expect(query).toHaveBeenCalledTimes(2)
    expect(query).toHaveBeenNthCalledWith(1, 'id, storage_path, title, category, image_type')
    expect(query).toHaveBeenNthCalledWith(2, 'id, storage_path, title, category')
  })

  it('does NOT fall back on an auth error and surfaces the real error', async () => {
    const query = vi.fn(async () => ({
      data: null,
      error: { message: 'JWT expired' },
    }))
    await expect(loadCharacterRows(query)).rejects.toThrow('JWT expired')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('does NOT fall back on an RLS / permission error', async () => {
    const query = vi.fn(async () => ({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    }))
    await expect(loadCharacterRows(query)).rejects.toThrow('row-level security')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('does NOT fall back on a network / timeout error', async () => {
    const query = vi.fn(async () => ({
      data: null,
      error: { message: 'fetch failed: connection refused' },
    }))
    await expect(loadCharacterRows(query)).rejects.toThrow('connection refused')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry more than once even if the legacy query also fails', async () => {
    const query = vi.fn()
    query
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'column generator_user_images.image_type does not exist' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'column generator_user_images.other does not exist' },
      })
    await expect(loadCharacterRows(query)).rejects.toThrow('generator_user_images.other')
    // Primary + exactly one legacy retry, then the real error surfaces.
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('preserves legacy sheet classification via the existing heuristic when imageType is null', async () => {
    const query = vi.fn()
    query
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'column generator_user_images.image_type does not exist' },
      })
      .mockResolvedValueOnce({
        data: [row({ title: 'Sarah — sheet' })],
        error: null,
      })
    const { rows } = await loadCharacterRows(query)
    // imageType is null, so isCharacterSheet falls back to the title heuristic.
    expect(rows[0].imageType).toBeNull()
    expect(isCharacterSheet(rows[0].imageType, rows[0].title, rows[0].storage_path)).toBe(true)
  })

  it('keeps a legacy plain character as a non-sheet when imageType is null', async () => {
    const query = vi.fn()
    query
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'column generator_user_images.image_type does not exist' },
      })
      .mockResolvedValueOnce({
        data: [row({ title: 'Sarah', storage_path: 'user/portrait-1712345-abc.png' })],
        error: null,
      })
    const { rows } = await loadCharacterRows(query)
    expect(rows[0].imageType).toBeNull()
    expect(isCharacterSheet(rows[0].imageType, rows[0].title, rows[0].storage_path)).toBe(false)
  })
})
