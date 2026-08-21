import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  CAMERA_STYLES,
  GENRE_STYLES,
  SCENE_STYLES,
  TEMPLATE_STYLES,
  SCENE_GROUP_ORDER,
  TEMPLATE_GROUP_ORDER,
  buildWizardCameraOptions,
  buildWizardThemeOptions,
} from './promptStyles'

function readJpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    const segmentLength = bytes.readUInt16BE(offset + 2)
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      }
    }
    if (segmentLength < 2) return undefined
    offset += segmentLength + 2
  }
  return undefined
}

describe('buildWizardCameraOptions', () => {
  it('includes Auto plus every shared camera style (all 10)', () => {
    const opts = buildWizardCameraOptions()
    expect(opts[0].value).toBe('auto')
    expect(opts[0].label).toBe('Auto (AI decides)')
    // Auto + all CAMERA_STYLES.
    expect(opts.length).toBe(1 + CAMERA_STYLES.length)
    expect(CAMERA_STYLES.length).toBe(10)
    // Every shared camera style id is present exactly once.
    for (const s of CAMERA_STYLES) {
      const matches = opts.filter((o) => o.value === s.id)
      expect(matches.length).toBe(1)
      expect(matches[0].label).toBe(s.label)
      expect(matches[0].prompt).toBe(s.prompt)
    }
  })

  it('separates the static poster from the opt-in video URL for each camera style', () => {
    const opts = buildWizardCameraOptions()
    for (const s of CAMERA_STYLES) {
      const o = opts.find((x) => x.value === s.id)!
      expect(o.videoUrl).toBe(s.preview)
      expect(o.posterUrl).toMatch(/\/src\/assets\/style-posters\/.+\.jpg|style-posters\/.+\.jpg/)
    }
  })
})

describe('buildWizardThemeOptions', () => {
  it('includes Auto, all genres, all scenes (grouped) and all templates (grouped)', () => {
    const opts = buildWizardThemeOptions()
    expect(opts[0].value).toBe('auto')
    const ids = opts.map((o) => o.value)
    // Every genre present.
    for (const g of GENRE_STYLES) expect(ids).toContain(g.id)
    // Every scene present (including Industrial and Construction & Civil Works).
    for (const s of SCENE_STYLES) expect(ids).toContain(s.id)
    // Every template present.
    for (const t of TEMPLATE_STYLES) expect(ids).toContain(t.id)
    // No duplicates.
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('orders scene groups by SCENE_GROUP_ORDER and template groups by TEMPLATE_GROUP_ORDER', () => {
    const opts = buildWizardThemeOptions()
    const sceneOpts = opts.filter((o) => o.group?.startsWith('Scene · '))
    const templateOpts = opts.filter((o) => o.group?.startsWith('Template · '))

    // Scene groups appear in SCENE_GROUP_ORDER first, then any extra groups
    // (e.g. Construction & Civil Works) are appended so nothing is dropped.
    const sceneGroupOrder = sceneOpts.map((o) => o.group!.replace('Scene · ', ''))
    const seenSceneGroups: string[] = []
    for (const g of sceneGroupOrder) {
      if (!seenSceneGroups.includes(g)) seenSceneGroups.push(g)
    }
    // The SCENE_GROUP_ORDER groups must appear first, in order.
    expect(seenSceneGroups.slice(0, SCENE_GROUP_ORDER.length)).toEqual(SCENE_GROUP_ORDER)
    // Every distinct scene group is present (nothing dropped).
    const allSceneGroups = Array.from(new Set(SCENE_STYLES.map((s) => s.group).filter((g): g is string => Boolean(g))))
    for (const g of allSceneGroups) expect(seenSceneGroups).toContain(g)

    // Template groups appear in TEMPLATE_GROUP_ORDER.
    const templateGroupOrder = templateOpts.map((o) => o.group!.replace('Template · ', ''))
    const seenTemplateGroups: string[] = []
    for (const g of templateGroupOrder) {
      if (!seenTemplateGroups.includes(g)) seenTemplateGroups.push(g)
    }
    expect(seenTemplateGroups).toEqual(TEMPLATE_GROUP_ORDER)
  })

  it('keeps Construction & Civil Works scenes accessible (not dropped by group order)', () => {
    const opts = buildWizardThemeOptions()
    const construction = opts.filter((o) => o.group === 'Scene · Construction & Civil Works')
    expect(construction.length).toBeGreaterThan(0)
    // The rebar site scene is present.
    expect(construction.some((o) => o.value === 'rebar-site')).toBe(true)
  })

  it('gives every Construction & Civil Works scene a distinct local poster and its project video', () => {
    const construction = buildWizardThemeOptions().filter((o) => o.group === 'Scene · Construction & Civil Works')
    expect(construction).toHaveLength(38)

    for (const option of construction) {
      expect(option.posterUrl).toMatch(/style-posters\/scene-.+\.jpg/)
      expect(option.videoUrl).toMatch(/^\/__l5e\/assets-v1\/.+\/scene-.+\.mp4$/)
    }

    expect(new Set(construction.map((option) => option.posterUrl)).size).toBe(construction.length)
    expect(new Set(construction.map((option) => option.videoUrl)).size).toBe(construction.length)
  })

  it('ships every Construction & Civil Works poster as a valid lightweight 16:9 JPEG', () => {
    const construction = buildWizardThemeOptions().filter((o) => o.group === 'Scene · Construction & Civil Works')

    for (const option of construction) {
      const posterPath = resolve(process.cwd(), 'src/assets/style-posters', `scene-${option.value}.jpg`)
      const bytes = readFileSync(posterPath)
      expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
      expect(bytes.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]))
      expect(readJpegDimensions(bytes)).toEqual({ width: 320, height: 180 })
      expect(statSync(posterPath).size).toBeLessThan(50_000)
    }
  })

  it('labels genres, scenes and templates with their subgroup', () => {
    const opts = buildWizardThemeOptions()
    const genre = opts.find((o) => o.value === 'epic-fantasy')!
    expect(genre.group).toBe('Genre & atmosphere')
    const scene = opts.find((o) => o.value === 'construction-site')!
    expect(scene.group).toBe('Scene · Industrial & Construction')
    const template = opts.find((o) => o.value === 'product-promo')!
    expect(template.group).toBe('Template · Corporate & Business')
  })
})
