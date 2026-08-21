import { describe, it, expect } from 'vitest'
import {
  REVIEW_LANGS,
  isRtlLang,
  englishFilmType,
  stripMarkdown,
  buildUnifiedScenario,
  chunkScenario,
  hasNonLatin,
} from './scenarioReview'
import type { FilmPlan } from './makeFilmWizard'

function plan(scenarioText: string, i = 0): FilmPlan {
  return {
    planIndex: i,
    totalPlans: 1,
    label: `SHOT ${i + 1} OF 1`,
    coverage: 'medium',
    durationSeconds: 5,
    scenarioText,
  }
}

describe('REVIEW_LANGS', () => {
  it('includes the required languages', () => {
    const codes = REVIEW_LANGS.map((l) => l.code)
    for (const c of ['en', 'fa', 'ar', 'tr', 'es', 'fr', 'de', 'ru', 'zh']) {
      expect(codes).toContain(c)
    }
  })
})

describe('isRtlLang', () => {
  it('is true for Persian and Arabic only', () => {
    expect(isRtlLang('fa')).toBe(true)
    expect(isRtlLang('ar')).toBe(true)
    expect(isRtlLang('en')).toBe(false)
    expect(isRtlLang('tr')).toBe(false)
  })
})

describe('englishFilmType', () => {
  it('maps Persian film types to English', () => {
    expect(englishFilmType('معرفی محصول')).toBe('Product Introduction')
    expect(englishFilmType('تبلیغاتی')).toBe('Advertising')
  })
  it('passes through unknown/empty values', () => {
    expect(englishFilmType('Custom')).toBe('Custom')
    expect(englishFilmType('')).toBe('')
    expect(englishFilmType(null)).toBe('')
  })
})

describe('stripMarkdown', () => {
  it('removes bold markers', () => {
    expect(stripMarkdown('**Visuals:** the shot')).toBe('Visuals: the shot')
    expect(stripMarkdown('**SCENE 1 (0-15 seconds)**')).toBe('SCENE 1 (0-15 seconds)')
  })
  it('removes backticks', () => {
    expect(stripMarkdown('`code` here')).toBe('code here')
  })
  it('leaves plain text untouched', () => {
    expect(stripMarkdown('plain text')).toBe('plain text')
  })
})

describe('buildUnifiedScenario', () => {
  it('joins plans in order with SHOT boundaries and strips markdown', () => {
    const plans = [
      plan('**Visuals:** first shot'),
      plan('**Narration:** "hello"', 1),
    ]
    const out = buildUnifiedScenario(plans)
    expect(out).toContain('SHOT 1 (0–5s)')
    expect(out).toContain('SHOT 2 (5–10s)')
    expect(out).toContain('Visuals: first shot')
    expect(out).toContain('Narration: "hello"')
    expect(out).not.toContain('**')
  })
})

describe('chunkScenario', () => {
  it('returns a single chunk when under the limit', () => {
    expect(chunkScenario('short', 5000)).toEqual(['short'])
  })
  it('splits on blank-line boundaries without exceeding the limit', () => {
    const block = 'x'.repeat(3000)
    const text = `${block}\n\n${block}`
    const chunks = chunkScenario(text, 5000)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toBe(block)
    expect(chunks[1]).toBe(block)
  })
})

describe('hasNonLatin', () => {
  it('detects Persian/Arabic/Cyrillic/CJK', () => {
    expect(hasNonLatin('یک کارگر')).toBe(true)
    expect(hasNonLatin('العربية')).toBe(true)
    expect(hasNonLatin('Русский')).toBe(true)
    expect(hasNonLatin('中文')).toBe(true)
    expect(hasNonLatin('English text')).toBe(false)
  })
})
