import { describe, it, expect } from 'vitest'
import {
  validateReferenceSpecs,
  buildIdentityEvalPrompt,
  parseIdentityEvalResponse,
  classifyEvalVerdict,
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
    if (r.ok) expect(r.specs).toEqual([{ url: 'https://x/p.png', role: 'product', characterSheet: false }])
  })

  it('accepts a single character reference', () => {
    const r = validateReferenceSpecs(['https://x/c.png'], ['character'])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.specs).toEqual([{ url: 'https://x/c.png', role: 'character', characterSheet: false }])
  })

  it('accepts product + character and normalizes to deterministic order', () => {
    // Character-first input is reordered to product-first.
    const r = validateReferenceSpecs(
      ['https://x/c.png', 'https://x/p.png'],
      ['character', 'product'],
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.specs).toEqual([
        { url: 'https://x/p.png', role: 'product', characterSheet: false },
        { url: 'https://x/c.png', role: 'character', characterSheet: false },
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

  // A real product photo folder can hold several angles of the same product,
  // and every angle should reach generation together — so multiple "product"
  // entries are now accepted. Only "character" stays capped at one (see the
  // next test). This is an intentional relaxation, not the duplicate-role
  // rejection this test used to pin.
  it('accepts multiple product roles (every grouped angle of one product), in original relative order', () => {
    const r = validateReferenceSpecs(
      ['https://x/p1.png', 'https://x/p2.png'],
      ['product', 'product'],
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.specs).toEqual([
        { url: 'https://x/p1.png', role: 'product', characterSheet: false },
        { url: 'https://x/p2.png', role: 'product', characterSheet: false },
      ])
    }
  })

  it('rejects a duplicate character role', () => {
    const r = validateReferenceSpecs(
      ['https://x/c1.png', 'https://x/c2.png'],
      ['character', 'character'],
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Duplicate reference role')
  })

  it('rejects more than the max reference count (a bounded number of product angles plus one character)', () => {
    const urls = Array.from({ length: MAX_REFERENCE_IMAGES + 1 }, (_, i) => `https://x/${i}.png`)
    const roles = Array.from({ length: MAX_REFERENCE_IMAGES + 1 }, () => 'product')
    const r = validateReferenceSpecs(urls, roles)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('At most')
  })

  it('exposes only product and character as allowed roles', () => {
    expect(ALLOWED_ROLES).toEqual(['product', 'character'])
  })

  it('attaches the character-sheet flag to its own reference across a character-first sort', () => {
    // Character-first input: the sheet flag must stay with the character even
    // though validateReferenceSpecs reorders to product-first. This is the
    // regression that caused the flag to be dropped/misaligned in the real
    // data path.
    const r = validateReferenceSpecs(
      ['https://x/c.png', 'https://x/p.png'],
      ['character', 'product'],
      [true, false],
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.specs).toEqual([
        { url: 'https://x/p.png', role: 'product', characterSheet: false },
        { url: 'https://x/c.png', role: 'character', characterSheet: true },
      ])
    }
  })

  it('keeps the character-sheet flag false for a plain character in product-first input', () => {
    const r = validateReferenceSpecs(
      ['https://x/p.png', 'https://x/c.png'],
      ['product', 'character'],
      [false, false],
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.specs[1]).toEqual({ url: 'https://x/c.png', role: 'character', characterSheet: false })
    }
  })

  it('never sets characterSheet on a product reference even if the flag is true', () => {
    const r = validateReferenceSpecs(
      ['https://x/p.png', 'https://x/c.png'],
      ['product', 'character'],
      [true, true],
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.specs[0]).toEqual({ url: 'https://x/p.png', role: 'product', characterSheet: false })
      expect(r.specs[1]).toEqual({ url: 'https://x/c.png', role: 'character', characterSheet: true })
    }
  })

  it('treats a missing characterSheets array as no sheets (backward compatible)', () => {
    const r = validateReferenceSpecs(
      ['https://x/c.png'],
      ['character'],
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.specs[0]).toEqual({ url: 'https://x/c.png', role: 'character', characterSheet: false })
    }
  })
})

describe('buildIdentityEvalPrompt', () => {
  it('labels the generated output and each reference with role', () => {
    const prompt = buildIdentityEvalPrompt([
      { url: 'https://x/p.png', role: 'product' },
      { url: 'https://x/c.png', role: 'character' },
    ])
    expect(prompt).toContain('GENERATED_OUTPUT')
    expect(prompt).toContain('REF_1 (PRODUCT)')
    expect(prompt).toContain('REF_2 (CHARACTER)')
  })

  it('treats a character sheet as a single identity in the prompt', () => {
    const prompt = buildIdentityEvalPrompt([
      { url: 'https://x/c.png', role: 'character', characterSheet: true },
    ])
    // The per-reference note is added only for a character sheet.
    expect(prompt).toContain('REF_1 (CHARACTER): the image labelled "REF_1" (a multi-view character sheet: every view shows the SAME one person)')
    // The general instruction tells the evaluator a sheet is one identity and
    // that a different person must be rejected.
    expect(prompt).toContain('MULTI-VIEW CHARACTER SHEET')
    expect(prompt).toContain('every view is the same person')
    expect(prompt).toContain('A different person — even a real-looking woman or man — is NOT a match')
  })

  it('does not add the per-reference sheet note for a plain character reference', () => {
    const prompt = buildIdentityEvalPrompt([
      { url: 'https://x/c.png', role: 'character' },
    ])
    expect(prompt).not.toContain('(a multi-view character sheet: every view shows the SAME one person)')
  })

  it('does not add the per-reference sheet note for a product reference', () => {
    const prompt = buildIdentityEvalPrompt([
      { url: 'https://x/p.png', role: 'product', characterSheet: true },
    ])
    expect(prompt).not.toContain('(a multi-view character sheet: every view shows the SAME one person)')
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

describe('classifyEvalVerdict', () => {
  it('classifies a passing outcome as "pass"', () => {
    const out = { perReference: [{ present: true, match: true, reason: 'ok' }], passed: true }
    expect(classifyEvalVerdict(out)).toBe('pass')
  })

  it('classifies a dropped identity as "identity-fail"', () => {
    const out = {
      perReference: [{ present: false, match: false, reason: 'absent' }],
      passed: false,
    }
    expect(classifyEvalVerdict(out)).toBe('identity-fail')
  })

  it('classifies a present-but-not-matching identity as "identity-fail"', () => {
    const out = {
      perReference: [{ present: true, match: false, reason: 'different' }],
      passed: false,
    }
    expect(classifyEvalVerdict(out)).toBe('identity-fail')
  })

  it('classifies a null outcome (unparseable / technical) as "error"', () => {
    expect(classifyEvalVerdict(null)).toBe('error')
  })
})
