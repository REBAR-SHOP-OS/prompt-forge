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
})
