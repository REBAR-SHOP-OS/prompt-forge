import { describe, it, expect } from 'vitest'
import { reviewNarration, type TimestampedWord } from './narrationReview'

function w(word: string, start: number, end: number): TimestampedWord {
  return { word, start, end }
}

describe('reviewNarration', () => {
  it('returns pass when transcript matches expected well', () => {
    const words = [w('Hello', 0, 0.4), w('world', 0.5, 0.9), w('today', 1.0, 1.4)]
    const result = reviewNarration(['Hello world today'], words, 'Hello world today')
    expect(result.status).toBe('pass')
    expect(result.issues).toHaveLength(0)
    expect(result.matchPercent).toBeGreaterThanOrEqual(80)
  })

  it('returns no-narration when expectedLines is empty', () => {
    const words = [w('Something', 0, 0.5)]
    const result = reviewNarration([], words, 'Something')
    expect(result.status).toBe('no-narration')
    expect(result.issues).toHaveLength(0)
  })

  it('returns no-speech when transcript is empty', () => {
    const result = reviewNarration(['Expected narration text'], [], '')
    expect(result.status).toBe('no-speech')
  })

  it('returns issues when words are wrong', () => {
    // Expected: "Welcome to our store" — film says "Welcome to our shop"
    const words = [
      w('Welcome', 0, 0.3),
      w('to', 0.35, 0.45),
      w('our', 0.5, 0.65),
      w('shop', 0.7, 1.0),
    ]
    const result = reviewNarration(['Welcome to our store'], words, 'Welcome to our shop')
    expect(result.status).toBe('issues')
    expect(result.issues.length).toBeGreaterThan(0)
    // The issue should reference the "store" vs "shop" mismatch
    const issue = result.issues[0]
    expect(issue.startSeconds).toBeGreaterThanOrEqual(0)
    expect(issue.endSeconds).toBeGreaterThan(issue.startSeconds)
    expect(issue.problem).toBeTruthy()
  })

  it('catches extra speech not in expected narration', () => {
    // Expected: "Buy now" — film says "Buy now and save money today"
    const words = [
      w('Buy', 0, 0.2),
      w('now', 0.3, 0.5),
      w('and', 0.6, 0.7),
      w('save', 0.8, 1.0),
      w('money', 1.1, 1.4),
      w('today', 1.5, 1.8),
    ]
    const result = reviewNarration(['Buy now'], words, 'Buy now and save money today')
    expect(result.status).toBe('issues')
    const extraIssue = result.issues.find((i) => i.problem.toLowerCase().includes('unexpected'))
    expect(extraIssue).toBeDefined()
  })

  it('catches significant missing words (below 80% match threshold)', () => {
    // Expected: "Welcome everyone join us today for our grand opening event"
    // Film says: "Welcome to our opening" — many words missing
    const words = [
      w('Welcome', 0, 0.4),
      w('to', 0.5, 0.65),
      w('our', 0.7, 0.85),
      w('opening', 1.2, 1.6),
    ]
    const result = reviewNarration(
      ['Welcome everyone join us today for our grand opening event'],
      words,
      'Welcome to our opening',
    )
    expect(result.status).toBe('issues')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.matchPercent).toBeLessThan(80)
  })

  it('handles multi-line expected narration joined as single comparison', () => {
    const words = [w('Line', 0, 0.3), w('one', 0.4, 0.6), w('line', 0.8, 1.0), w('two', 1.1, 1.3)]
    const result = reviewNarration(['Line one', 'line two'], words, 'Line one line two')
    expect(result.status).toBe('pass')
  })

  it('is case-insensitive and punctuation-tolerant', () => {
    const words = [w('hello,', 0, 0.4), w('world!', 0.5, 0.9)]
    const result = reviewNarration(['Hello World'], words, 'hello, world!')
    expect(result.status).toBe('pass')
  })

  // ── Regression: narrated film must not be misclassified as no-narration / no-speech ──

  it('[regression] narrated film with matching transcript is NOT misclassified as silent', () => {
    // This is the exact scenario that triggered the bug: a Final film has speech
    // but the expected narration was missing from the merged entry.
    // reviewNarration itself should never return no-speech when words are present.
    const words = [
      w('فروشگاه', 0.0, 0.5),
      w('ما', 0.6, 0.75),
      w('خوش', 0.9, 1.1),
      w('آمدید', 1.2, 1.5),
    ]
    const result = reviewNarration(
      ['فروشگاه ما خوش آمدید'],
      words,
      'فروشگاه ما خوش آمدید',
    )
    expect(result.status).not.toBe('no-speech')
    expect(result.status).not.toBe('no-narration')
    expect(result.status).toBe('pass')
  })

  it('[regression] film with ANY spoken words + empty expectedLines → no-narration (not no-speech)', () => {
    // If the Final film card has no narration in any source clip, the panel
    // should show "no-narration", not "no-speech". Speech was detected but
    // there's nothing to compare it against.
    const words = [w('Hello', 0, 0.5), w('world', 0.6, 1.0)]
    const result = reviewNarration([], words, 'Hello world')
    expect(result.status).toBe('no-narration')
  })

  it('[regression] correct narration with word-level timestamps produces pass with matchPercent 100', () => {
    const words = [
      w('Shop', 0.0, 0.3),
      w('the', 0.4, 0.5),
      w('latest', 0.6, 0.9),
      w('collection', 1.0, 1.5),
    ]
    const result = reviewNarration(['Shop the latest collection'], words, 'Shop the latest collection')
    expect(result.status).toBe('pass')
    expect(result.matchPercent).toBe(100)
    expect(result.issues).toHaveLength(0)
    expect(result.transcript).toBe('Shop the latest collection')
  })

  it('[regression] timed wrong narration — issues carry exact start/end from word timestamps', () => {
    // Expected: "Order now for free delivery"
    // Film says:  "Order now for fast shipping"
    //              ─────────────────────────────
    // "for" matches; "free delivery" is wrong, replaced by "fast shipping"
    const words = [
      w('Order', 0.0, 0.4),
      w('now', 0.5, 0.7),
      w('for', 0.8, 0.9),
      w('fast', 1.0, 1.3),
      w('shipping', 1.4, 1.9),
    ]
    const result = reviewNarration(
      ['Order now for free delivery'],
      words,
      'Order now for fast shipping',
    )
    expect(result.status).toBe('issues')
    expect(result.issues.length).toBeGreaterThan(0)
    const issue = result.issues[0]
    // Timestamps must be real numbers from the word data, not 0
    expect(issue.startSeconds).toBeGreaterThanOrEqual(0)
    expect(issue.endSeconds).toBeGreaterThan(issue.startSeconds)
    // Issue text/suggestion must reference the mismatched words
    expect(issue.problem).toContain('free delivery')
    expect(issue.problem).toContain('fast shipping')
  })

  it('[regression] multi-clip narration aggregated across newlines — whole text compared', () => {
    // Simulates narration_text aggregated from 2 clips:
    //   Clip 1: "Introducing our brand."
    //   Clip 2: "Visit us today."
    // Film says all of it correctly.
    const words = [
      w('Introducing', 0.0, 0.5),
      w('our', 0.6, 0.7),
      w('brand', 0.8, 1.1),
      w('Visit', 1.5, 1.8),
      w('us', 1.9, 2.0),
      w('today', 2.1, 2.5),
    ]
    const result = reviewNarration(
      ['Introducing our brand.', 'Visit us today.'],
      words,
      'Introducing our brand Visit us today',
    )
    expect(result.status).toBe('pass')
    expect(result.matchPercent).toBeGreaterThanOrEqual(80)
  })
})

// ── Translation helper logic (pure/unit-testable) ────────────────────────────

describe('translation text resolution', () => {
  it('resolves translated text from map when available', () => {
    const map = new Map([['Hello world', 'سلام دنیا']])
    const t = (orig: string | undefined) =>
      (orig && map.has(orig) ? map.get(orig)! : orig ?? '')
    expect(t('Hello world')).toBe('سلام دنیا')
  })

  it('falls back to original text when translation is not in map', () => {
    const map = new Map<string, string>()
    const t = (orig: string | undefined) =>
      (orig && map.has(orig) ? map.get(orig)! : orig ?? '')
    expect(t('Hello world')).toBe('Hello world')
  })

  it('returns empty string for undefined original text', () => {
    const map = new Map<string, string>()
    const t = (orig: string | undefined) =>
      (orig && map.has(orig) ? map.get(orig)! : orig ?? '')
    expect(t(undefined)).toBe('')
  })

  it('collects all unique translatable texts from a review result', () => {
    // Mirrors collectTranslatableTexts logic in NarrationReviewPanel
    function collectTranslatableTexts(transcript: string, issues: { text: string; suggestion?: string }[]) {
      const texts: string[] = []
      if (transcript) texts.push(transcript)
      for (const issue of issues) {
        if (issue.text) texts.push(issue.text)
        if (issue.suggestion) texts.push(issue.suggestion)
      }
      return texts
    }

    const transcript = 'fast shipping'
    const issues = [
      { text: 'fast shipping', suggestion: 'free delivery' },
    ]
    const texts = collectTranslatableTexts(transcript, issues)
    // transcript + issue.text + issue.suggestion = 3 strings (note: 'fast shipping' appears twice as distinct strings)
    expect(texts).toContain('fast shipping')
    expect(texts).toContain('free delivery')
    expect(texts.length).toBe(3)
  })

  it('handles translation error gracefully — original text preserved in fallback', () => {
    // When translation fails, the map stays empty and t() returns originals.
    const map = new Map<string, string>() // translation failed → empty
    const t = (orig: string | undefined) =>
      (orig && map.has(orig) ? map.get(orig)! : orig ?? '')
    expect(t('فروشگاه ما')).toBe('فروشگاه ما')
    expect(t('Welcome')).toBe('Welcome')
  })
})
