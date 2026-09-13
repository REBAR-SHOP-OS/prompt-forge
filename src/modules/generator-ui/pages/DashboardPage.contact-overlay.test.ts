import { describe, expect, it } from 'vitest'
import dashboardSource from './DashboardPage.tsx?raw'
import mergeSource from '../lib/mergeVideos.ts?raw'

const finalFilmStart = dashboardSource.indexOf('const overlayArg = contactActive')
const finalFilmEnd = dashboardSource.indexOf('const mergeProgressCb', finalFilmStart)
const finalFilmWiring = dashboardSource.slice(finalFilmStart, finalFilmEnd)

const previewStart = dashboardSource.indexOf('{contactActive && !isMergedFinalPreview')
const previewEnd = dashboardSource.indexOf('{transcriptOpen &&', previewStart)
const previewWiring = dashboardSource.slice(previewStart, previewEnd)

describe('DashboardPage contact overlay wiring', () => {
  it('passes only the selected layers to final-film rendering', () => {
    expect(finalFilmStart).toBeGreaterThan(-1)
    expect(finalFilmEnd).toBeGreaterThan(finalFilmStart)
    expect(finalFilmWiring).toContain('lines: activeContactOverlay.lines')
    expect(finalFilmWiring).toContain('logoUrl: activeContactOverlay.logoUrl')
    expect(finalFilmWiring).toContain('panelEnabled: activeContactOverlay.panelEnabled')
  })

  it('renders the same selected fields in the live preview', () => {
    expect(previewStart).toBeGreaterThan(-1)
    expect(previewEnd).toBeGreaterThan(previewStart)
    expect(previewWiring).toContain('activeContactOverlay.logoUrl ?')
    expect(previewWiring).toContain('src={activeContactOverlay.logoUrl}')
    expect(previewWiring).toContain('activeContactOverlay.lines.map')
    expect(previewWiring).toContain('activeContactOverlay.panelEnabled')
  })

  it('does not enable a hydrated profile logo without an explicit saved opt-in', () => {
    expect(dashboardSource).toMatch(/logoUrl:\s*'',\s*[\s\S]{0,300}logoEnabled:\s*false/)
    expect(dashboardSource).toContain('base = { ...base, ...(JSON.parse(raw) as Partial<ContactOverlay>), enabled: false }')
    expect(dashboardSource).toContain("logoUrl: (data as { contact_logo_url?: string | null }).contact_logo_url ?? ''")
  })

  it('left-aligns top and bottom presets in both preview and exported film', () => {
    expect(previewWiring).toContain('top-0 items-start justify-start')
    expect(previewWiring).toContain('bottom-0 items-end justify-start')
    expect(mergeSource).toContain('ctx.drawImage(logo as HTMLImageElement, padX, y, logoW, logoH)')
    expect(mergeSource).toContain('ctx.fillText(line, padX, y, cw - padX * 2)')
  })
})
