import { describe, expect, it } from 'vitest'
import {
  getCoverForScope,
  getCoverDurationForScope,
  clearCoverForScope,
  clearCoverDurationForScope,
  shouldIncludeCoverInMerge,
  type CoverMap,
  type CoverDurationMap,
} from './coverScope'
import type { UserImageItem } from '@/modules/generator-ui/pages/DashboardPage'

function makeCover(id: string): UserImageItem {
  return {
    id,
    storage_path: `/path/to/${id}.png`,
    created_at: '2026-01-01T00:00:00Z',
    still_duration_seconds: 3,
    width: 1080,
    height: 1920,
    category: 'cover',
  } as UserImageItem
}

const DEFAULT_DURATION = 3

describe('coverScope', () => {
  describe('getCoverForScope', () => {
    it('returns the cover for the current scope', () => {
      const covers: CoverMap = { 'draft-a': makeCover('img-1') }
      expect(getCoverForScope(covers, 'draft-a')?.id).toBe('img-1')
    })

    it('returns null when no cover exists for the scope', () => {
      const covers: CoverMap = { 'draft-a': makeCover('img-1') }
      expect(getCoverForScope(covers, 'draft-b')).toBeNull()
    })

    it('returns null when scopeKey is null', () => {
      const covers: CoverMap = { 'draft-a': makeCover('img-1') }
      expect(getCoverForScope(covers, null)).toBeNull()
    })

    it('returns null for an empty covers map', () => {
      expect(getCoverForScope({}, 'draft-a')).toBeNull()
    })
  })

  describe('getCoverDurationForScope', () => {
    it('returns the stored duration for the scope', () => {
      const durations: CoverDurationMap = { 'draft-a': 5 }
      expect(getCoverDurationForScope(durations, 'draft-a', DEFAULT_DURATION)).toBe(5)
    })

    it('returns the default when no duration is stored', () => {
      expect(getCoverDurationForScope({}, 'draft-a', DEFAULT_DURATION)).toBe(DEFAULT_DURATION)
    })

    it('returns the default when scopeKey is null', () => {
      const durations: CoverDurationMap = { 'draft-a': 5 }
      expect(getCoverDurationForScope(durations, null, DEFAULT_DURATION)).toBe(DEFAULT_DURATION)
    })

    it('clamps to [1, 10]', () => {
      expect(getCoverDurationForScope({ 'draft-a': 0 }, 'draft-a', DEFAULT_DURATION)).toBe(1)
      expect(getCoverDurationForScope({ 'draft-a': 99 }, 'draft-a', DEFAULT_DURATION)).toBe(10)
    })
  })

  describe('clearCoverForScope', () => {
    it('removes the cover for the given scope', () => {
      const covers: CoverMap = {
        'draft-a': makeCover('img-1'),
        'draft-b': makeCover('img-2'),
      }
      const next = clearCoverForScope(covers, 'draft-a')
      expect(next).not.toHaveProperty('draft-a')
      expect(next).toHaveProperty('draft-b')
    })

    it('returns the same map when scopeKey is null', () => {
      const covers: CoverMap = { 'draft-a': makeCover('img-1') }
      expect(clearCoverForScope(covers, null)).toBe(covers)
    })

    it('returns the same map when scope does not exist', () => {
      const covers: CoverMap = { 'draft-a': makeCover('img-1') }
      expect(clearCoverForScope(covers, 'draft-b')).toBe(covers)
    })

    it('does not mutate the original map', () => {
      const covers: CoverMap = { 'draft-a': makeCover('img-1') }
      const next = clearCoverForScope(covers, 'draft-a')
      expect(covers).toHaveProperty('draft-a')
      expect(next).not.toHaveProperty('draft-a')
    })
  })

  describe('clearCoverDurationForScope', () => {
    it('removes the duration for the given scope', () => {
      const durations: CoverDurationMap = { 'draft-a': 5, 'draft-b': 3 }
      const next = clearCoverDurationForScope(durations, 'draft-a')
      expect(next).not.toHaveProperty('draft-a')
      expect(next).toHaveProperty('draft-b')
    })

    it('returns the same map when scopeKey is null', () => {
      const durations: CoverDurationMap = { 'draft-a': 5 }
      expect(clearCoverDurationForScope(durations, null)).toBe(durations)
    })
  })

  describe('shouldIncludeCoverInMerge', () => {
    it('returns true when a cover exists for the scope', () => {
      const covers: CoverMap = { 'draft-a': makeCover('img-1') }
      expect(shouldIncludeCoverInMerge(covers, 'draft-a')).toBe(true)
    })

    it('returns false when no cover exists for the scope', () => {
      const covers: CoverMap = { 'draft-a': makeCover('img-1') }
      expect(shouldIncludeCoverInMerge(covers, 'draft-b')).toBe(false)
    })

    it('returns false when scopeKey is null', () => {
      const covers: CoverMap = { 'draft-a': makeCover('img-1') }
      expect(shouldIncludeCoverInMerge(covers, null)).toBe(false)
    })

    it('returns false for an empty covers map', () => {
      expect(shouldIncludeCoverInMerge({}, 'draft-a')).toBe(false)
    })
  })

  describe('stale cover isolation', () => {
    it('a cover from a previous project does not appear in a new project scope', () => {
      const oldCovers: CoverMap = { 'draft-old': makeCover('img-old') }
      const newScope = 'draft-new'
      expect(getCoverForScope(oldCovers, newScope)).toBeNull()
      expect(shouldIncludeCoverInMerge(oldCovers, newScope)).toBe(false)
    })

    it('a cover from a finalized project does not appear in a new draft', () => {
      const covers: CoverMap = { 'final-123': makeCover('img-final') }
      const newDraft = 'draft-new'
      expect(getCoverForScope(covers, newDraft)).toBeNull()
    })

    it('after Start Over, the old scope key is gone so no cover', () => {
      // Start Over clears activeDraftId and selectedProjectId, so scopeKey
      // becomes null. Even if the coverImages map still has stale entries,
      // getCoverForScope returns null for a null scope.
      const staleCovers: CoverMap = { 'draft-old': makeCover('img-old') }
      expect(getCoverForScope(staleCovers, null)).toBeNull()
      expect(shouldIncludeCoverInMerge(staleCovers, null)).toBe(false)
    })
  })
})