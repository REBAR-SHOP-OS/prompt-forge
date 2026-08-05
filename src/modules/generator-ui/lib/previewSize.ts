export type PreviewSize = Readonly<{ w: number; h: number }>

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
