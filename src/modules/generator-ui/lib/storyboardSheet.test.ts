import { describe, expect, it } from 'vitest'
import {
  createApprovedStoryboardSnapshot,
  replaceStoryboardPanel,
  storyboardFramesForShot,
  storyboardShotInstruction,
} from './storyboardSheet'

describe('storyboard sheet state', () => {
  it('replaces only the regenerated panel and leaves the prior sheet untouched', () => {
    const original = ['shot-1.png', 'shot-2.png', 'shot-3.png']
    const next = replaceStoryboardPanel(original, 1, 'shot-2-v2.png')

    expect(original).toEqual(['shot-1.png', 'shot-2.png', 'shot-3.png'])
    expect(next).toEqual(['shot-1.png', 'shot-2-v2.png', 'shot-3.png'])
  })

  it('captures an immutable approved snapshot rather than live arrays', () => {
    const scenes = ['scene 1', 'scene 2']
    const shotImageUrls = ['shot-1.png', 'shot-2.png']
    const snapshot = createApprovedStoryboardSnapshot({
      revision: 4,
      sheetUrl: 'https://example.com/storyboard-r4.jpg',
      scenes,
      shotImageUrls,
    })

    scenes[0] = 'changed later'
    shotImageUrls[0] = 'changed-later.png'

    expect(snapshot).toEqual({
      revision: 4,
      sheetUrl: 'https://example.com/storyboard-r4.jpg',
      scenes: ['scene 1', 'scene 2'],
      shotImageUrls: ['shot-1.png', 'shot-2.png'],
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.scenes)).toBe(true)
    expect(Object.isFrozen(snapshot.shotImageUrls)).toBe(true)
  })

  it('tells WAN to start from the sheet and expand panel one without rendering the grid', () => {
    const snapshot = createApprovedStoryboardSnapshot({
      revision: 2,
      sheetUrl: 'https://example.com/storyboard-r2.jpg',
      scenes: ['scene 1', 'scene 2'],
      shotImageUrls: ['shot-1.png', 'shot-2.png'],
    })

    expect(storyboardShotInstruction(snapshot, 0)).toContain('full storyboard sheet')
    expect(storyboardShotInstruction(snapshot, 0)).toContain('expand panel 1 to full-screen')
    expect(storyboardShotInstruction(snapshot, 0)).toContain('Never show the storyboard grid')
    expect(storyboardShotInstruction(snapshot, 1)).toContain('panel 2')
  })

  it('starts the film from the full sheet, then hands off sequentially to approved panels', () => {
    const snapshot = createApprovedStoryboardSnapshot({
      revision: 3,
      sheetUrl: 'https://example.com/storyboard-r3.jpg',
      scenes: ['scene 1', 'scene 2'],
      shotImageUrls: ['shot-1.png', 'shot-2.png'],
    })

    expect(storyboardFramesForShot({
      storyboard: snapshot,
      shotIndex: 0,
      approvedShotUrl: 'shot-1.png',
    })).toEqual({
      startFrameUrl: 'https://example.com/storyboard-r3.jpg',
      endFrameUrl: 'shot-1.png',
    })
    expect(storyboardFramesForShot({
      storyboard: snapshot,
      shotIndex: 1,
      previousLastFrameUrl: 'clip-1-last.png',
      approvedShotUrl: 'shot-2.png',
    })).toEqual({
      startFrameUrl: 'clip-1-last.png',
      endFrameUrl: 'shot-2.png',
    })
  })
})
