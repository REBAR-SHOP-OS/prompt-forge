import { describe, it, expect, vi } from 'vitest'
import {
  expectedSceneCount,
  expectedPlanCount,
  computeClipDurations,
  computePlanDurations,
  computePlanCoverage,
  sumClipDurations,
  computeSceneBeats,
  beatGuideForClip,
  narrationWordBudget,
  buildScenarioPrompt,
  buildSceneImagePrompt,
  buildClipPrompt,
  buildReferenceImageUrls,
  resolveSceneNarration,
  canApproveFilm,
  isCharacterSheet,
  isMissingImageTypeColumnError,
  loadCharacterRows,
  sanitizeProductName,
  FILM_DURATIONS,
  buildFilmPlans,
  validateFilmPlans,
  splitNarrationAcrossPlans,
  splitScenarioIntoPlans,
  buildPlanImagePrompt,
  buildPlanClipPrompt,
  computePlanCredits,
  type FilmPlan,
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

describe('expectedPlanCount', () => {
  it('maps each duration to duration/5 plans', () => {
    expect(expectedPlanCount(5)).toBe(1)
    expect(expectedPlanCount(10)).toBe(2)
    expect(expectedPlanCount(15)).toBe(3)
    expect(expectedPlanCount(30)).toBe(6)
    expect(expectedPlanCount(45)).toBe(9)
    expect(expectedPlanCount(60)).toBe(12)
    expect(expectedPlanCount(90)).toBe(18)
    expect(expectedPlanCount(135)).toBe(27)
  })
})

describe('computePlanDurations', () => {
  it('splits every duration into 5s plans whose sum equals the total', () => {
    for (const duration of FILM_DURATIONS) {
      const plans = computePlanDurations(duration)
      expect(plans).toHaveLength(expectedPlanCount(duration))
      for (const p of plans) expect(p).toBe(5)
      expect(sumClipDurations(plans)).toBe(duration)
    }
  })
})

describe('computePlanCoverage', () => {
  it('maps 1 plan to medium, 2 plans to wide+close, 3 plans to wide+medium+close', () => {
    expect(computePlanCoverage(5)).toEqual(['medium'])
    expect(computePlanCoverage(10)).toEqual(['wide', 'close'])
    expect(computePlanCoverage(15)).toEqual(['wide', 'medium', 'close'])
  })

  it('cycles wide→medium→close across a multi-card film', () => {
    // 30s = 2 cards × 3 plans = 6 plans
    expect(computePlanCoverage(30)).toEqual(['wide', 'medium', 'close', 'wide', 'medium', 'close'])
    // 45s = 3 cards × 3 plans = 9 plans
    expect(computePlanCoverage(45)).toEqual([
      'wide', 'medium', 'close',
      'wide', 'medium', 'close',
      'wide', 'medium', 'close',
    ])
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

describe('computeSceneBeats', () => {
  it('splits a 15s clip into contiguous beats that sum exactly to 15', () => {
    const beats = computeSceneBeats(15)
    expect(beats).toEqual(['0-4', '4-9', '9-15'])
    // Contiguous: end of one equals start of the next, no gaps/overlap.
    for (let i = 1; i < beats.length; i++) {
      const prevEnd = Number(beats[i - 1].split('-')[1])
      const nextStart = Number(beats[i].split('-')[0])
      expect(prevEnd).toBe(nextStart)
    }
    // Covers the whole clip with no time beyond the duration.
    expect(Number(beats[0].split('-')[0])).toBe(0)
    expect(Number(beats[beats.length - 1].split('-')[1])).toBe(15)
  })

  it('splits 10s and 5s clips correctly', () => {
    expect(computeSceneBeats(10)).toEqual(['0-5', '5-10'])
    expect(computeSceneBeats(5)).toEqual(['0-5'])
  })
})

describe('beatGuideForClip', () => {
  it('describes the beat structure for each clip duration', () => {
    expect(beatGuideForClip(15)).toBe('15s = 3 beats (0-4, 4-9, 9-15)')
    expect(beatGuideForClip(10)).toBe('10s = 2 beats (0-5, 5-10)')
    expect(beatGuideForClip(5)).toBe('5s = 1 beat (0-5)')
  })
})

describe('narrationWordBudget', () => {
  it('caps narration words to the real time budget (~2 words/second)', () => {
    expect(narrationWordBudget(15, true)).toBe(30)
    expect(narrationWordBudget(10, true)).toBe(20)
    expect(narrationWordBudget(5, true)).toBe(10)
  })

  it('returns 0 when narration is disabled (no speech at all)', () => {
    expect(narrationWordBudget(15, false)).toBe(0)
    expect(narrationWordBudget(5, false)).toBe(0)
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
    // if its title happens to contain the "-- sheet" marker.
    expect(isCharacterSheet('character', 'Sarah -- sheet', 'https://x/user/410b50ff-abc.png')).toBe(false)
  })
  it('detects a legacy generated sheet by its "-- sheet" title marker when image_type is null', () => {
    expect(isCharacterSheet(null, 'Sarah -- sheet', 'https://x/1.png')).toBe(true)
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
        data: [row({ title: 'Sarah -- sheet' })],
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

describe('sanitizeProductName', () => {
  it('strips a zero-padded auto number suffix (stirup001 -> stirup)', () => {
    expect(sanitizeProductName('stirup001')).toBe('stirup')
    expect(sanitizeProductName('stirup_001')).toBe('stirup')
    expect(sanitizeProductName('stirup-001')).toBe('stirup')
    expect(sanitizeProductName('stirup 001')).toBe('stirup')
  })

  it('strips a trailing file extension', () => {
    expect(sanitizeProductName('stirup001.png')).toBe('stirup')
    expect(sanitizeProductName('stirup.jpg')).toBe('stirup')
    expect(sanitizeProductName('stirup.webp')).toBe('stirup')
  })

  it('strips a duplicate marker like (1)', () => {
    expect(sanitizeProductName('stirup (1)')).toBe('stirup')
    expect(sanitizeProductName('stirup(2)')).toBe('stirup')
    expect(sanitizeProductName('stirup - copy')).toBe('stirup')
  })

  it('preserves meaningful numbers (iPhone 15, Rebar #4, 3M, ISO 9001)', () => {
    expect(sanitizeProductName('iPhone 15')).toBe('iPhone 15')
    expect(sanitizeProductName('Rebar #4')).toBe('Rebar #4')
    expect(sanitizeProductName('3M')).toBe('3M')
    expect(sanitizeProductName('ISO 9001')).toBe('ISO 9001')
  })

  it('preserves a plain name with no suffix', () => {
    expect(sanitizeProductName('stirup')).toBe('stirup')
    expect(sanitizeProductName('Rebar.Shop')).toBe('Rebar.Shop')
  })

  it('falls back to the original title or Selected Product when empty', () => {
    expect(sanitizeProductName(null)).toBe('Selected Product')
    expect(sanitizeProductName('')).toBe('Selected Product')
    expect(sanitizeProductName('   ')).toBe('Selected Product')
  })
})

// ---------------------------------------------------------------------------
// Plan-based film tests
// ---------------------------------------------------------------------------

describe('buildFilmPlans', () => {
  it('builds correct plans for a 15s film with 3 plans', () => {
    const plans = buildFilmPlans(15, 'The product is shown in a workshop. A craftsman picks it up. He demonstrates its features.', 'Narration: Discover the power of precision.')
    expect(plans).toHaveLength(3)
    expect(plans[0].label).toBe('SHOT 1 OF 3')
    expect(plans[0].coverage).toBe('wide')
    expect(plans[0].durationSeconds).toBe(5)
    expect(plans[1].label).toBe('SHOT 2 OF 3')
    expect(plans[1].coverage).toBe('medium')
    expect(plans[2].label).toBe('SHOT 3 OF 3')
    expect(plans[2].coverage).toBe('close')
  })

  it('builds correct plans for a 5s film with 1 plan', () => {
    const plans = buildFilmPlans(5, 'A quick showcase of the product.', undefined)
    expect(plans).toHaveLength(1)
    expect(plans[0].label).toBe('SHOT 1 OF 1')
    expect(plans[0].coverage).toBe('medium')
  })

  it('builds correct plans for a 30s film with 6 plans', () => {
    const plans = buildFilmPlans(30, 'Scene one. Scene two. Scene three. Scene four. Scene five. Scene six.', undefined)
    expect(plans).toHaveLength(6)
    expect(plans.map((p) => p.coverage)).toEqual([
      'wide', 'medium', 'close',
      'wide', 'medium', 'close',
    ])
  })

  it('preserves total duration across all plans', () => {
    for (const duration of FILM_DURATIONS) {
      const plans = buildFilmPlans(duration, 'Test scenario text for the film.', 'Narration: Test narration.')
      const total = plans.reduce((acc, p) => acc + p.durationSeconds, 0)
      expect(total).toBe(duration)
    }
  })
})

describe('validateFilmPlans', () => {
  it('validates correct plans', () => {
    const plans = buildFilmPlans(15, 'Test scenario.', undefined)
    const result = validateFilmPlans(15, plans)
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('fails when plan count is wrong', () => {
    const plans = buildFilmPlans(15, 'Test scenario.', undefined)
    const result = validateFilmPlans(30, plans)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Expected 6 plans')
  })

  it('fails when total duration does not match', () => {
    const plans = buildFilmPlans(15, 'Test scenario.', undefined)
    plans[0].durationSeconds = 10 as 5 // force invalid
    const result = validateFilmPlans(15, plans)
    expect(result.valid).toBe(false)
  })
})

describe('splitNarrationAcrossPlans', () => {
  it('splits narration evenly across plans', () => {
    const narration = 'First sentence. Second sentence. Third sentence. Fourth sentence.'
    const parts = splitNarrationAcrossPlans(narration, 4)
    expect(parts).toHaveLength(4)
    expect(parts[0]).toContain('First sentence')
    expect(parts[1]).toContain('Second sentence')
    expect(parts[2]).toContain('Third sentence')
    expect(parts[3]).toContain('Fourth sentence')
  })

  it('puts all narration in plan 0 when not enough sentences', () => {
    const narration = 'One sentence only.'
    const parts = splitNarrationAcrossPlans(narration, 3)
    expect(parts[0]).toBe('One sentence only.')
    expect(parts[1]).toBeUndefined()
    expect(parts[2]).toBeUndefined()
  })

  it('returns undefined for all plans when narration is missing', () => {
    const parts = splitNarrationAcrossPlans(undefined, 3)
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBeUndefined()
    expect(parts[1]).toBeUndefined()
    expect(parts[2]).toBeUndefined()
  })
})

describe('splitScenarioIntoPlans', () => {
  it('splits by paragraphs when paragraph count matches plan count', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.'
    const parts = splitScenarioIntoPlans(text, 3)
    expect(parts).toHaveLength(3)
    expect(parts[0]).toContain('Paragraph one')
    expect(parts[1]).toContain('Paragraph two')
    expect(parts[2]).toContain('Paragraph three')
  })

  it('returns whole text as single plan when plan count is 1', () => {
    const text = 'The entire scenario is here.'
    const parts = splitScenarioIntoPlans(text, 1)
    expect(parts).toEqual([text])
  })

  it('falls back to sentence splitting when paragraphs do not match', () => {
    const text = 'One. Two. Three. Four. Five. Six.'
    const parts = splitScenarioIntoPlans(text, 3)
    expect(parts).toHaveLength(3)
    expect(parts[0]).toContain('One')
    expect(parts[1]).toContain('Three')
    expect(parts[2]).toContain('Five')
  })
})

describe('buildPlanImagePrompt', () => {
  it('includes plan label and coverage in the prompt', () => {
    const plan: FilmPlan = {
      planIndex: 0,
      totalPlans: 3,
      label: 'SHOT 1 OF 3',
      coverage: 'wide',
      durationSeconds: 5,
      scenarioText: 'A wide establishing shot.',
    }
    const out = buildPlanImagePrompt(plan, {}, {}, {}, false)
    expect(out).toContain('SHOT 1 OF 3')
    expect(out).toContain('Coverage: wide shot')
    expect(out).toContain('A wide establishing shot')
  })

  it('adds no-text directive when requested', () => {
    const plan: FilmPlan = {
      planIndex: 0,
      totalPlans: 1,
      label: 'SHOT 1 OF 1',
      coverage: 'medium',
      durationSeconds: 5,
      scenarioText: 'Test.',
    }
    const out = buildPlanImagePrompt(plan, {}, {}, {}, true)
    expect(out).toContain('Strictly no text')
  })
})

describe('buildPlanClipPrompt', () => {
  it('includes identity lock and plan label', () => {
    const plan: FilmPlan = {
      planIndex: 0,
      totalPlans: 3,
      label: 'SHOT 1 OF 3',
      coverage: 'wide',
      durationSeconds: 5,
      scenarioText: 'The hero enters.',
    }
    const out = buildPlanClipPrompt(
      plan,
      { product: { id: 'p1', title: 'Widget', url: 'https://x/p.png' } },
      {},
      {},
    )
    expect(out).toContain('PRODUCT IDENTITY LOCK')
    expect(out).toContain('Widget')
    expect(out).toContain('SHOT 1 OF 3')
  })
})

describe('computePlanCredits', () => {
  it('computes credits as planCount * costPerJob', () => {
    expect(computePlanCredits(1)).toBe(1)
    expect(computePlanCredits(3)).toBe(3)
    expect(computePlanCredits(6, 2)).toBe(12)
    expect(computePlanCredits(27)).toBe(27)
  })
})

// ---------------------------------------------------------------------------
// Plan count and total time validation tests
// ---------------------------------------------------------------------------

describe('plan count validation', () => {
  it('maps each duration to the correct plan count (duration/5)', () => {
    expect(expectedPlanCount(5)).toBe(1)
    expect(expectedPlanCount(10)).toBe(2)
    expect(expectedPlanCount(15)).toBe(3)
    expect(expectedPlanCount(30)).toBe(6)
    expect(expectedPlanCount(45)).toBe(9)
    expect(expectedPlanCount(60)).toBe(12)
    expect(expectedPlanCount(90)).toBe(18)
    expect(expectedPlanCount(135)).toBe(27)
  })

  it('produces exactly 5-second plans for all supported durations', () => {
    for (const duration of FILM_DURATIONS) {
      const plans = buildFilmPlans(duration, 'Test scenario text.', undefined)
      expect(plans).toHaveLength(expectedPlanCount(duration))
      for (const plan of plans) {
        expect(plan.durationSeconds).toBe(5)
      }
    }
  })

  it('calculates total time correctly as planCount * 5', () => {
    for (const duration of FILM_DURATIONS) {
      const plans = buildFilmPlans(duration, 'Test scenario text.', undefined)
      const total = plans.reduce((acc, p) => acc + p.durationSeconds, 0)
      expect(total).toBe(duration)
      expect(total).toBe(plans.length * 5)
    }
  })

  it('preserves plan order for all durations', () => {
    for (const duration of FILM_DURATIONS) {
      const plans = buildFilmPlans(duration, 'Test scenario text.', undefined)
      for (let i = 0; i < plans.length; i++) {
        expect(plans[i].planIndex).toBe(i)
        expect(plans[i].label).toBe(`SHOT ${i + 1} OF ${plans.length}`)
      }
    }
  })

  it('cycles camera coverage correctly for multi-card films', () => {
    // 30s = 2 cards × 3 plans = 6 plans
    const plans30 = buildFilmPlans(30, 'Test scenario.', undefined)
    expect(plans30.map((p) => p.coverage)).toEqual([
      'wide', 'medium', 'close',
      'wide', 'medium', 'close',
    ])

    // 45s = 3 cards × 3 plans = 9 plans
    const plans45 = buildFilmPlans(45, 'Test scenario.', undefined)
    expect(plans45.map((p) => p.coverage)).toEqual([
      'wide', 'medium', 'close',
      'wide', 'medium', 'close',
      'wide', 'medium', 'close',
    ])
  })

  it('handles 10s films with wide→close coverage', () => {
    const plans = buildFilmPlans(10, 'Test scenario.', undefined)
    expect(plans).toHaveLength(2)
    expect(plans[0].coverage).toBe('wide')
    expect(plans[1].coverage).toBe('close')
  })

  it('handles 5s films with single medium coverage', () => {
    const plans = buildFilmPlans(5, 'Test scenario.', undefined)
    expect(plans).toHaveLength(1)
    expect(plans[0].coverage).toBe('medium')
  })
})

describe('total time validation', () => {
  it('validates total duration matches expected for all durations', () => {
    for (const duration of FILM_DURATIONS) {
      const plans = buildFilmPlans(duration, 'Test scenario.', undefined)
      const result = validateFilmPlans(duration, plans)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    }
  })

  it('fails validation when total duration does not match', () => {
    const plans = buildFilmPlans(15, 'Test scenario.', undefined)
    // Modify one plan to break total duration
    plans[0].durationSeconds = 10 as 5
    const result = validateFilmPlans(15, plans)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Plan durations sum to')
  })

  it('fails validation when plan count is incorrect', () => {
    const plans = buildFilmPlans(15, 'Test scenario.', undefined)
    const result = validateFilmPlans(30, plans)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Expected 6 plans')
  })
})

describe('plan credit consumption', () => {
  it('calculates correct credits for all supported durations', () => {
    for (const duration of FILM_DURATIONS) {
      const planCount = expectedPlanCount(duration)
      const credits = computePlanCredits(planCount)
      expect(credits).toBe(planCount)
      expect(credits).toBe(duration / 5)
    }
  })

  it('shows plan count and credits before production', () => {
    const duration = 30
    const planCount = expectedPlanCount(duration)
    const credits = computePlanCredits(planCount)
    expect(planCount).toBe(6)
    expect(credits).toBe(6)
    expect(planCount * 5).toBe(duration)
  })
})
