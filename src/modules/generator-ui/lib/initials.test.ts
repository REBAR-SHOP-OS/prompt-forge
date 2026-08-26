import { describe, it, expect } from 'vitest'
import { initialsFor, initialsForName } from './initials'

describe('initialsFor', () => {
  it('derives two initials from a dotted/underscored local part', () => {
    expect(initialsFor('radin.rebar@example.com')).toBe('RR')
    expect(initialsFor('radin_rebar@example.com')).toBe('RR')
    expect(initialsFor('radin-rebar@example.com')).toBe('RR')
  })

  it('falls back to a single initial for a plain local part', () => {
    expect(initialsFor('radin@example.com')).toBe('R')
  })

  it('returns ? for empty input', () => {
    expect(initialsFor('')).toBe('?')
    expect(initialsFor(null)).toBe('?')
    expect(initialsFor(undefined)).toBe('?')
  })
})

describe('initialsForName', () => {
  it('uses first + last initials when both present', () => {
    expect(initialsForName('Radin', 'Rebar', 'radin@example.com')).toBe('RR')
  })

  it('falls back to first initial when last is empty', () => {
    expect(initialsForName('Radin', '', 'radin@example.com')).toBe('R')
  })

  it('falls back to email initials when name is empty', () => {
    expect(initialsForName('', '', 'radin.rebar@example.com')).toBe('RR')
  })
})
