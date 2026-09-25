import { describe, it, expect } from 'vitest'
import { spliceRegeneratedCard } from './regenerationOrder'

describe('spliceRegeneratedCard', () => {
  it('replaces the ID when a manual order already exists', () => {
    const currentOrder = ['card-a', 'card-b-old', 'card-c']
    const displayed = ['card-c', 'card-a', 'card-b-old'] // Chrono isn't used

    const result = spliceRegeneratedCard(currentOrder, displayed, 'card-b-old', 'card-b-new')

    expect(result).toEqual(['card-a', 'card-b-new', 'card-c'])
  })

  it('captures the current displayed chronological order if manual order is null', () => {
    // If manualOrder is null, displayedClips drives the rendering (usually chronological ASC).
    // The user clicked regenerate on card-b-old.
    const currentOrder = null
    const displayed = ['card-a', 'card-b-old', 'card-c']

    const result = spliceRegeneratedCard(currentOrder, displayed, 'card-b-old', 'card-b-new')

    // We expect it to freeze that displayed order into a new manualOrder array
    // so the regenerated card stays exactly where it was.
    expect(result).toEqual(['card-a', 'card-b-new', 'card-c'])
  })

  it('returns unchanged arrays if the old ID is missing', () => {
    const currentOrder = ['card-a', 'card-b-old', 'card-c']
    const result = spliceRegeneratedCard(currentOrder, [], 'missing', 'new')
    expect(result).toEqual(['card-a', 'card-b-old', 'card-c'])
    expect(result).not.toBe(currentOrder) // always returns a new array
  })
})
