import { describe, expect, it } from 'vitest'
import {
  MAX_REFERENCE_IMAGES,
  selectEvaluatedSpecs,
  validateReferenceSpecs,
  type ReferenceSpec,
} from './identity-eval'

// Regression coverage for the multi-view product identity fix: a real product
// photo folder can hold several angles of the same product, and every angle
// should reach the generation request together — not one picked by
// round-robin. This module is the architectural gate for that: it caps the
// TOTAL reference count and used to reject ANY duplicate role (including a
// second "product"), which made sending more than one product angle through
// the same request impossible. validateReferenceSpecs now allows multiple
// "product" entries while keeping "character" capped at exactly one, and
// selectEvaluatedSpecs narrows what identity-eval actually judges so a single
// generated image is never held to an impossible multi-angle standard.
describe('validateReferenceSpecs', () => {
  it('accepts N product URLs plus one character URL, in deterministic product-first order', () => {
    const result = validateReferenceSpecs(
      ['https://x/front.png', 'https://x/side.png', 'https://x/back.png', 'https://x/character.png'],
      ['product', 'product', 'product', 'character'],
      [false, false, false, true],
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.specs.map((s) => [s.url, s.role, s.characterSheet])).toEqual([
      ['https://x/front.png', 'product', false],
      ['https://x/side.png', 'product', false],
      ['https://x/back.png', 'product', false],
      ['https://x/character.png', 'character', true],
    ])
  })

  it('preserves the original relative order of the product entries regardless of input interleaving', () => {
    const result = validateReferenceSpecs(
      ['https://x/character.png', 'https://x/front.png', 'https://x/side.png'],
      ['character', 'product', 'product'],
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Product-first, character last — but the two product URLs keep their own
    // relative order (front before side), not reversed or re-sorted.
    expect(result.specs.map((s) => s.url)).toEqual([
      'https://x/front.png',
      'https://x/side.png',
      'https://x/character.png',
    ])
  })

  it('rejects two character URLs (character stays capped at exactly one)', () => {
    const result = validateReferenceSpecs(
      ['https://x/character-1.png', 'https://x/character-2.png'],
      ['character', 'character'],
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/only one character/i)
  })

  it('rejects a payload larger than MAX_REFERENCE_IMAGES', () => {
    const urls = Array.from({ length: MAX_REFERENCE_IMAGES + 1 }, (_, i) => `https://x/p${i}.png`)
    const roles = urls.map(() => 'product')
    const result = validateReferenceSpecs(urls, roles)
    expect(result.ok).toBe(false)
  })

  it('still accepts the legacy single product + single character payload', () => {
    const result = validateReferenceSpecs(
      ['https://x/p.png', 'https://x/c.png'],
      ['product', 'character'],
    )
    expect(result.ok).toBe(true)
  })
})

describe('selectEvaluatedSpecs reaches the generation request as one identity', () => {
  it('returns exactly the first product spec plus the character spec, dropping extra product specs', () => {
    const specs: ReferenceSpec[] = [
      { url: 'https://x/front.png', role: 'product', characterSheet: false },
      { url: 'https://x/side.png', role: 'product', characterSheet: false },
      { url: 'https://x/back.png', role: 'product', characterSheet: false },
      { url: 'https://x/character.png', role: 'character', characterSheet: true },
    ]
    const evaluated = selectEvaluatedSpecs(specs)
    expect(evaluated).toEqual([
      { url: 'https://x/front.png', role: 'product', characterSheet: false },
      { url: 'https://x/character.png', role: 'character', characterSheet: true },
    ])
  })

  it('returns just the first product spec when there is no character', () => {
    const specs: ReferenceSpec[] = [
      { url: 'https://x/front.png', role: 'product', characterSheet: false },
      { url: 'https://x/side.png', role: 'product', characterSheet: false },
    ]
    expect(selectEvaluatedSpecs(specs)).toEqual([
      { url: 'https://x/front.png', role: 'product', characterSheet: false },
    ])
  })

  it('returns just the character spec when there is no product', () => {
    const specs: ReferenceSpec[] = [
      { url: 'https://x/character.png', role: 'character', characterSheet: false },
    ]
    expect(selectEvaluatedSpecs(specs)).toEqual(specs)
  })

  it('returns an empty array for an empty input', () => {
    expect(selectEvaluatedSpecs([])).toEqual([])
  })
})
