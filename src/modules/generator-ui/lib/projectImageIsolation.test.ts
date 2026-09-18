import { describe, expect, it } from 'vitest'

import {
  resolveVisibleProjectImages,
  selectLegacyProjectImagesByOwnerId,
} from './projectImageIsolation'

type Image = {
  id: string
  created_at: string
  storage_path: string
  category?: string | null
  title?: string | null
}

const image = (id: string, createdAt = '2026-09-18T12:00:00.000Z'): Image => ({
  id,
  created_at: createdAt,
  storage_path: `images/${id}.png`,
  category: 'general',
})

const baseInput = (overrides: Partial<Parameters<typeof resolveVisibleProjectImages<Image>>[0]> = {}) => ({
  userImages: [image('workspace-image')],
  selectedProjectId: null,
  projectSourceImages: {},
  draftSourceImages: {},
  activeDraftId: null,
  workspaceHiddenImageIds: new Set<string>(),
  coverImageIds: new Set<string>(),
  activeImageIds: new Set(['workspace-image']),
  ...overrides,
})

describe('resolveVisibleProjectImages', () => {
  it('returns the selected project snapshot and refreshes its rows from live data', () => {
    const staleSnapshot = { ...image('project-image'), title: 'stale title' }
    const liveImage = { ...image('project-image'), title: 'current title' }

    const result = resolveVisibleProjectImages(baseInput({
      userImages: [image('workspace-image'), liveImage],
      selectedProjectId: 'merged-normal',
      projectSourceImages: { 'merged-normal': [staleSnapshot] },
      activeImageIds: new Set(['workspace-image', 'project-image']),
    }))

    expect(result).toEqual([liveImage])
  })

  it('keeps an explicit empty merged-project snapshot empty instead of leaking workspace images', () => {
    const result = resolveVisibleProjectImages(baseInput({
      selectedProjectId: 'merged-empty',
      projectSourceImages: { 'merged-empty': [] },
    }))

    expect(result).toEqual([])
  })

  it('keeps an explicit empty draft snapshot empty instead of leaking workspace images', () => {
    const result = resolveVisibleProjectImages(baseInput({
      selectedProjectId: 'draft-00000000-0000-0000-0000-000000000001',
      draftSourceImages: { 'draft-00000000-0000-0000-0000-000000000001': [] },
    }))

    expect(result).toEqual([])
  })

  it('does not fall through for a selected project whose snapshot is absent', () => {
    const result = resolveVisibleProjectImages(baseInput({
      selectedProjectId: 'merged-legacy-without-snapshot',
    }))

    expect(result).toEqual([])
  })

  it('preserves non-selected workspace filtering behavior', () => {
    const active = image('active')
    const hidden = image('hidden')
    const claimed = image('claimed')
    const otherDraft = image('other-draft')
    const activeDraft = image('active-draft')
    const cover = { ...image('cover'), category: 'cover' }
    const reframe = { ...image('reframe'), category: 'reframe' }

    const result = resolveVisibleProjectImages(baseInput({
      userImages: [active, hidden, claimed, otherDraft, activeDraft, cover, reframe],
      projectSourceImages: { 'merged-one': [claimed] },
      draftSourceImages: {
        'draft-active': [activeDraft],
        'draft-other': [otherDraft],
      },
      activeDraftId: 'draft-active',
      workspaceHiddenImageIds: new Set(['hidden']),
      coverImageIds: new Set(['cover']),
      activeImageIds: new Set(['active', 'hidden', 'claimed', 'other-draft', 'active-draft', 'cover', 'reframe']),
    }))

    expect(result).toEqual([active, activeDraft])
  })
})

describe('selectLegacyProjectImagesByOwnerId', () => {
  it('refuses timestamp-only attribution for an older legacy image', () => {
    const oldEnoughByFormerHeuristic = image('unowned-old', '2020-01-01T00:00:00.000Z')

    const result = selectLegacyProjectImagesByOwnerId(
      [oldEnoughByFormerHeuristic],
      'merged-created-later',
      {},
    )

    expect(result).toEqual([])
  })

  it('accepts an image only when deterministic ownership names the project', () => {
    const owned = image('owned')
    const ownedElsewhere = image('owned-elsewhere')

    const result = selectLegacyProjectImagesByOwnerId(
      [owned, ownedElsewhere],
      'merged-target',
      { owned: 'merged-target', 'owned-elsewhere': 'merged-other' },
    )

    expect(result).toEqual([owned])
  })
})
