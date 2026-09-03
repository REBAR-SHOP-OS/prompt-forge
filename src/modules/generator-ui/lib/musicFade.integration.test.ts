import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('music fade integration', () => {
  it('applies the fade envelope in both Final Film render engines', () => {
    const mediaRecorderRenderer = source('./mergeVideos.ts')
    const webCodecsRenderer = source('./mergeVideosWebCodecs.ts')
    expect(mediaRecorderRenderer).toContain('musicGainAtFilmTime({')
    expect(mediaRecorderRenderer).toContain('fadeInSec: musicTrack?.fadeInSec')
    expect(webCodecsRenderer).toContain('scheduleMusicFade(gain.gain, {')
    expect(webCodecsRenderer).toContain('fadeOutSec: music.fadeOutSec')
  })

  it('persists, restores, and exposes independent soundtrack fade controls', () => {
    const dashboard = source('../pages/DashboardPage.tsx')
    expect(dashboard).toContain('musicFadeInSec?: number')
    expect(dashboard).toContain('setMusicFadeInSec(audioSettings?.musicFadeInSec ?? 0)')
    expect(dashboard).toContain('aria-label="Music fade in duration"')
    expect(dashboard).toContain('aria-label="Music fade out duration"')
    expect(dashboard).toContain('fadeInSec: musicFadeInSec')
  })
})
