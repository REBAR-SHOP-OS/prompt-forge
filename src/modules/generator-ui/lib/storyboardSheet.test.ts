import { describe, expect, it } from 'vitest'
import {
  buildStoryboardSheetPrompt,
  createApprovedStoryboardSnapshot,
  replaceStoryboardPanel,
  storyboardFramesForShot,
  storyboardGrid,
  storyboardShotInstruction,
} from './storyboardSheet'

describe('storyboard sheet state', () => {
  it('replaces only the regenerated sheet and leaves the prior value untouched', () => {
    const original = ['storyboard-v1.png']
    const next = replaceStoryboardPanel(original, 0, 'storyboard-v2.png')

    expect(original).toEqual(['storyboard-v1.png'])
    expect(next).toEqual(['storyboard-v2.png'])
  })

  it('captures an immutable approved snapshot rather than live arrays', () => {
    const scenes = ['scene 1', 'scene 2']
    const snapshot = createApprovedStoryboardSnapshot({
      revision: 4,
      sheetUrl: 'https://example.com/storyboard-r4.jpg',
      scenes,
      shotImageUrls: [],
    })

    scenes[0] = 'changed later'

    expect(snapshot).toEqual({
      revision: 4,
      sheetUrl: 'https://example.com/storyboard-r4.jpg',
      scenes: ['scene 1', 'scene 2'],
      shotImageUrls: [],
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.scenes)).toBe(true)
    expect(Object.isFrozen(snapshot.shotImageUrls)).toBe(true)
  })

  it('uses a 2 by 3 grid for a 30-second film', () => {
    expect(storyboardGrid(6)).toEqual({ columns: 2, rows: 3 })
  })

  it('builds one numbered sheet prompt with one 5-second slot per panel', () => {
    const prompt = buildStoryboardSheetPrompt({
      durationSeconds: 30,
      aspect: '16:9',
      plans: Array.from({ length: 6 }, (_, index) => ({
        scenarioText: `Moment ${index + 1}`,
      })),
    })

    expect(prompt).toContain('ONE single cinematic storyboard contact-sheet image')
    expect(prompt).toContain('exactly 6 equal panels')
    expect(prompt).toContain('2-column by 3-row grid')
    expect(prompt).toContain('Every panel is exactly one 5-second slot')
    expect(prompt).toContain('PANEL 1 (seconds 0-5): Moment 1')
    expect(prompt).toContain('PANEL 6 (seconds 25-30): Moment 6')
  })

  it('tells WAN to start from the sheet and never render the grid', () => {
    const snapshot = createApprovedStoryboardSnapshot({
      revision: 2,
      sheetUrl: 'https://example.com/storyboard-r2.jpg',
      scenes: ['scene 1', 'scene 2'],
      shotImageUrls: [],
    })

    expect(storyboardShotInstruction(snapshot, 0)).toContain('only approved storyboard sheet')
    expect(storyboardShotInstruction(snapshot, 0)).toContain('expand panel 1 to full-screen')
    expect(storyboardShotInstruction(snapshot, 0)).toContain('Never show the storyboard grid')
    expect(storyboardShotInstruction(snapshot, 1)).toContain('panel 2')
  })

  it('starts from the single sheet and then chains actual clip end frames', () => {
    const snapshot = createApprovedStoryboardSnapshot({
      revision: 3,
      sheetUrl: 'https://example.com/storyboard-r3.jpg',
      scenes: ['scene 1', 'scene 2'],
      shotImageUrls: [],
    })

    expect(storyboardFramesForShot({
      storyboard: snapshot,
      shotIndex: 0,
    })).toEqual({
      startFrameUrl: 'https://example.com/storyboard-r3.jpg',
    })
    expect(storyboardFramesForShot({
      storyboard: snapshot,
      shotIndex: 1,
      previousLastFrameUrl: 'clip-1-last.png',
    })).toEqual({
      startFrameUrl: 'clip-1-last.png',
    })
  })
})
