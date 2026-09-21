import { describe, expect, it } from 'vitest'
import dashboardSource from './DashboardPage.tsx?raw'
import mergeSource from '../lib/mergeVideos.ts?raw'

const finalFilmStart = dashboardSource.indexOf('const overlayArg = contactActive')
const finalFilmEnd = dashboardSource.indexOf('const mergeProgressCb', finalFilmStart)
const finalFilmWiring = dashboardSource.slice(finalFilmStart, finalFilmEnd)

const previewStart = dashboardSource.indexOf('const renderContactPreviewOverlay')
const previewEnd = dashboardSource.indexOf('// Stores durable public URLs', previewStart)
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

  it('restores explicit saved visibility preferences without profile hydration changing them', () => {
    expect(dashboardSource).toMatch(/logoUrl:\s*'',\s*[\s\S]{0,300}logoEnabled:\s*false/)
    expect(dashboardSource).toContain('base = { ...base, ...(JSON.parse(raw) as Partial<ContactOverlay>) }')
    expect(dashboardSource).not.toContain('base = { ...base, ...(JSON.parse(raw) as Partial<ContactOverlay>), enabled: false }')
    expect(dashboardSource).toContain("logoUrl: (data as { contact_logo_url?: string | null }).contact_logo_url ?? ''")
  })

  it('mounts the same overlay renderer on video, image, and multi-clip previews', () => {
    expect(dashboardSource).toContain('overlay={renderContactPreviewOverlay()}')
    expect(dashboardSource).toContain('{renderContactPreviewOverlay()}\n                  <button')
    expect(dashboardSource).toContain('{!isMergedFinalPreview ? renderContactPreviewOverlay() : null}')
    expect(dashboardSource).toContain('frameRef={setContactBoxRef}')
    expect(dashboardSource).toContain('ref={setContactBoxRef}\n                  className="relative overflow-hidden bg-black"')
  })

  it('left-aligns top and bottom presets in both preview and exported film', () => {
    expect(previewWiring).toContain('top-0 items-start justify-start')
    expect(previewWiring).toContain('bottom-0 items-end justify-start')
    expect(mergeSource).toContain('ctx.drawImage(logo as HTMLImageElement, padX, y, logoW, logoH)')
    expect(mergeSource).toContain('ctx.fillText(line, padX, y, cw - padX * 2)')
  })
})
