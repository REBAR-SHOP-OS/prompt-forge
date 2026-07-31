import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadContinuity,
  saveContinuity,
  isMemoryEmpty,
  generateStarterMemory,
  buildContinuityBlock,
  applyContinuityPrompt,
  DEFAULT_CONTINUITY,
  EMPTY_MEMORY,
  type ContinuityState,
  type SceneMemory,
} from './continuity'

/**
 * Coverage for Continuity Mode scene-memory persistence + prompt assembly.
 *
 * These helpers gate whether a generated clip preserves character/style across
 * a chain, and they persist through localStorage with hand-rolled parsing and
 * fallbacks. Untested before this file; a regression here silently breaks
 * continuity for every multi-clip film. Serves the stabilization goal in #33.
 */

describe('loadContinuity', () => {
  beforeEach(() => window.localStorage.clear())

  it('returns defaults for a null/empty chain id', () => {
    expect(loadContinuity(null)).toEqual(DEFAULT_CONTINUITY)
    expect(loadContinuity(undefined)).toEqual(DEFAULT_CONTINUITY)
    expect(loadContinuity('')).toEqual(DEFAULT_CONTINUITY)
  })

  it('returns defaults when nothing is stored for the chain', () => {
    expect(loadContinuity('chain-unknown')).toEqual(DEFAULT_CONTINUITY)
  })

  it('returns defaults when the stored value is malformed JSON', () => {
    window.localStorage.setItem('generator:continuity:bad', '{not json')
    expect(loadContinuity('bad')).toEqual(DEFAULT_CONTINUITY)
  })

  it('fills missing memory fields with empty strings', () => {
    window.localStorage.setItem(
      'generator:continuity:partial',
      JSON.stringify({ enabled: true, memory: { character: 'Ivy' } }),
    )
    const state = loadContinuity('partial')
    expect(state.enabled).toBe(true)
    expect(state.memory).toEqual({ character: 'Ivy', environment: '', style: '', lastState: '' })
  })

  it('normalizes an unknown source back to previous-final-frame', () => {
    window.localStorage.setItem(
      'generator:continuity:src',
      JSON.stringify({ source: 'nonsense' }),
    )
    expect(loadContinuity('src').source).toBe('previous-final-frame')
    window.localStorage.setItem(
      'generator:continuity:src2',
      JSON.stringify({ source: 'best-clear-frame' }),
    )
    expect(loadContinuity('src2').source).toBe('best-clear-frame')
  })

  it('keeps a complete characterRef but drops an incomplete one', () => {
    window.localStorage.setItem(
      'generator:continuity:ref-ok',
      JSON.stringify({ characterRef: { id: 'c1', url: 'http://x/y.png', title: null } }),
    )
    expect(loadContinuity('ref-ok').characterRef).toEqual({ id: 'c1', url: 'http://x/y.png', title: null })

    window.localStorage.setItem(
      'generator:continuity:ref-bad',
      JSON.stringify({ characterRef: { id: 'c1' } }), // missing url
    )
    expect(loadContinuity('ref-bad').characterRef).toBeNull()
  })
})

describe('saveContinuity', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips a saved state', () => {
    const state: ContinuityState = {
      enabled: true,
      source: 'best-clear-frame',
      memory: { character: 'Ivy', environment: 'Neon city', style: 'Noir', lastState: 'Walking away' },
      characterRef: { id: 'c1', url: 'http://x/y.png', title: 'Hero' },
    }
    saveContinuity('chain-1', state)
    expect(loadContinuity('chain-1')).toEqual(state)
  })

  it('is a no-op for a null chain id (no throw, nothing written)', () => {
    expect(() => saveContinuity(null, DEFAULT_CONTINUITY)).not.toThrow()
    expect(window.localStorage.length).toBe(0)
  })
})

describe('isMemoryEmpty', () => {
  it('is true for empty and whitespace-only memory', () => {
    expect(isMemoryEmpty(EMPTY_MEMORY)).toBe(true)
    expect(isMemoryEmpty({ character: '  ', environment: '\t', style: '', lastState: ' ' })).toBe(true)
  })

  it('is false when any field has content', () => {
    expect(isMemoryEmpty({ ...EMPTY_MEMORY, style: 'Noir' })).toBe(false)
  })
})

describe('generateStarterMemory', () => {
  it('returns all-empty memory for an empty prompt', () => {
    expect(isMemoryEmpty(generateStarterMemory(''))).toBe(true)
  })

  it('derives fields from the first sentence of the prompt', () => {
    const mem = generateStarterMemory('A hero enters the hall. Then it collapses.')
    expect(mem.character).toContain('A hero enters the hall.')
    expect(mem.environment).toContain('A hero enters the hall.')
    expect(mem.lastState).toContain('A hero enters the hall.')
    expect(mem.style).not.toBe('')
  })

  it('prefers an explicit character description over the derived one', () => {
    const mem = generateStarterMemory('A hero enters.', 'A tall knight in red armor')
    expect(mem.character).toBe('A tall knight in red armor')
  })
})

describe('buildContinuityBlock / applyContinuityPrompt', () => {
  it('emits only the instruction (no Scene memory header) for empty memory', () => {
    const block = buildContinuityBlock(EMPTY_MEMORY)
    expect(block).not.toContain('Scene memory:')
    expect(block).toContain('Continue directly from the previous clip')
  })

  it('includes only the non-empty memory fields', () => {
    const mem: SceneMemory = { character: 'Ivy', environment: '', style: 'Noir', lastState: '' }
    const block = buildContinuityBlock(mem)
    expect(block).toContain('Scene memory:')
    expect(block).toContain('Main character: Ivy')
    expect(block).toContain('Visual style: Noir')
    expect(block).not.toContain('Environment:')
    expect(block).not.toContain('Previous ending state:')
  })

  it('appends the continuity block after the original prompt', () => {
    const out = applyContinuityPrompt('Base prompt', { ...EMPTY_MEMORY, character: 'Ivy' })
    expect(out.startsWith('Base prompt\n\n')).toBe(true)
    expect(out).toContain('Main character: Ivy')
  })
})
