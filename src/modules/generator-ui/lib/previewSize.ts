export type PreviewSize = Readonly<{ w: number; h: number }>

export const PREVIEW_VIDEO_WIDTH_CSS_VAR = '--preview-video-width'
export const PREVIEW_VIDEO_HEIGHT_CSS_VAR = '--preview-video-height'

type CssCustomPropertyTarget = {
  getPropertyValue: (name: string) => string
  setProperty: (name: string, value: string) => void
}

const normalizeDimension = (value: number) =>
  Math.max(0, Math.round(Number.isFinite(value) ? value : 0))

export const getNextPreviewSize = (
  current: PreviewSize,
  width: number,
  height: number,
): PreviewSize => {
  const w = normalizeDimension(width)
  const h = normalizeDimension(height)
  return current.w === w && current.h === h ? current : { w, h }
}

export const syncPreviewSizeCssVars = (
  style: CssCustomPropertyTarget,
  current: PreviewSize,
  width: number,
  height: number,
): PreviewSize => {
  const next = getNextPreviewSize(current, width, height)
  const cssValues = [
    [PREVIEW_VIDEO_WIDTH_CSS_VAR, `${next.w}px`],
    [PREVIEW_VIDEO_HEIGHT_CSS_VAR, `${next.h}px`],
  ] as const

  for (const [name, value] of cssValues) {
    if (style.getPropertyValue(name) !== value) style.setProperty(name, value)
  }

  return next
}
