import { describe, expect, it } from 'vitest'
import { buildReferenceImageUrls, explicitCharacterAnchor } from './identityAnchors'

describe('identity anchors', () => {
  it('ignores stale persisted continuity character when no character is visibly selected', () => {
    const staleContinuityCharacter = {
      id: 'old-character',
      url: 'https://example.test/old-character.png',
      title: 'Old character',
    }

    const visibleCharacter = explicitCharacterAnchor(null)
    const refs = buildReferenceImageUrls([visibleCharacter?.url])

    expect(visibleCharacter).toBeNull()
    expect(refs).toBeUndefined()
    expect(staleContinuityCharacter.url).toContain('old-character')
  })

  it('includes only explicit character and product anchors', () => {
    const refs = buildReferenceImageUrls([
      'https://example.test/character.png',
      'https://example.test/product.png',
    ])

    expect(refs).toEqual([
      'https://example.test/character.png',
      'https://example.test/product.png',
    ])
  })
})
