import { describe, it, expect } from 'vitest'
import {
  validateReferenceSpecs,
  buildIdentityEvalPrompt,
  parseIdentityEvalResponse,
  ALLOWED_ROLES,
  MAX_REFERENCE_IMAGES,
} from '../../../../supabase/functions/_shared/identity-eval'

describe('validateReferenceSpecs', () => {
  it('accepts empty references (no-reference flow)', () => {
    const r = validateReferenceSpecs([], [])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.specs).toEqual([])
  })

  it('accepts a single product reference', () => {
    const r = validateReferenceSpecs(['https://x/p.png'], ['product'])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.specs).toEqual([{ url: 'https://x/p.png', role: 'product' }])
  })

  it('accepts a single character reference', () => {
    const r = validateReferenceSpecs(['https://x/c.png'], ['character'])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.specs).toEqual([{ url: 'https://x/c.png', role: 'character' }])
  })

  it('accepts product + character in order', () => {
    const r = validateReferenceSpecs(
      ['https://x/p.png', 'https://x/c.png'],
      ['product', 'character'],
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.specs).toEqual([
        { url: 'https://x/p.png', role: 'product' },
        { url: 'https://x/c.png', role: 'character' },
      ])
    }
  })

  it('rejects mismatched lengths', () => {
    const r = validateReferenceSpecs(['https://x/p.png'], ['product', 'character'])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('same length')
  })

  it('rejects an invalid role', () => {
    const r = validateReferenceSpecs(['https://x/p.png'], ['banana'])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Invalid reference role')
  })

  it('rejects more than the max reference count', () => {
    const urls = Array.from({ length: MAX_REFERENCE_IMAGES + 1 }, (_, i) => `https://x/${i}.png`)
    const roles = Array.from({ length: MAX_REFERENCE_IMAGES + 1 }, () => 'product')
    const r = validateReferenceSpecs(urls, roles)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('At most')
  })

  it('exposes only product and character as allowed roles', () => {
    expect(ALLOWED_ROLES).toEqual(['product', 'character'])
  })
})

describe('buildIdentityEvalPrompt', () => {
  it('lists each reference with its role', () => {
    const prompt = buildIdentityEvalPrompt([
      { url: 'https://x/p.png', role: 'product' },
      { url: 'https://x/c.png', role: 'character' },
    ])
    expect(prompt).toContain('PRODUCT')
    expect(prompt).toContain('CHARACTER')
    expect(prompt).toContain('Reference 1')
    expect(prompt).toContain('Reference 2')
  })
})

describe('parseIdentityEvalResponse', () => {
  it('parses a valid response where both identities match', () => {
    const raw = JSON.stringify({
      perReference: [
        { present: true, match: true, reason: 'same product' },
        { present: true, match: true, reason: 'same character' },
      ],
    })
    const out = parseIdentityEvalResponse(raw, 2)
    expect(out).not.toBeNull()
    expect(out?.passed).toBe(true)
    expect(out?.perReference).toHaveLength(2)
  })

  it('fails when the character is dropped', () => {
    const raw = JSON.stringify({
      perReference: [
        { present: true, match: true, reason: 'same product' },
        { present: false, match: false, reason: 'character absent' },
      ],
    })
    const out = parseIdentityEvalResponse(raw, 2)
    expect(out?.passed).toBe(false)
    expect(out?.perReference[1].present).toBe(false)
  })

  it('fails when the product is dropped', () => {
    const raw = JSON.stringify({
      perReference: [
        { present: false, match: false, reason: 'product absent' },
        { present: true, match: true, reason: 'same character' },
      ],
    })
    const out = parseIdentityEvalResponse(raw, 2)
    expect(out?.passed).toBe(false)
    expect(out?.perReference[0].present).toBe(false)
  })

  it('fails when a present identity does not match', () => {
    const raw = JSON.stringify({
      perReference: [
        { present: true, match: false, reason: 'different product' },
        { present: true, match: true, reason: 'same character' },
      ],
    })
    const out = parseIdentityEvalResponse(raw, 2)
    expect(out?.passed).toBe(false)
  })

  it('returns null when the response has the wrong number of entries', () => {
    const raw = JSON.stringify({
      perReference: [{ present: true, match: true, reason: 'x' }],
    })
    expect(parseIdentityEvalResponse(raw, 2)).toBeNull()
  })

  it('returns null on unparseable input', () => {
    expect(parseIdentityEvalResponse('not json at all', 1)).toBeNull()
  })

  it('strips code fences before parsing', () => {
    const raw = '```json\n' + JSON.stringify({
      perReference: [{ present: true, match: true, reason: 'ok' }],
    }) + '\n```'
    const out = parseIdentityEvalResponse(raw, 1)
    expect(out?.passed).toBe(true)
  })
})
