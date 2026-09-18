export type ImageDimensions = {
  width: number
  height: number
}

export type ImageRatioPreset = '9:16' | '1:1' | '16:9'

export function validImageDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
): ImageDimensions | null {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) return null

  return { width, height }
}

export function imageAspectCss(
  width: number | null | undefined,
  height: number | null | undefined,
  fallback: string,
): string {
  const dimensions = validImageDimensions(width, height)
  return dimensions ? `${dimensions.width} / ${dimensions.height}` : fallback
}

export function imageRatioPreset(
  width: number | null | undefined,
  height: number | null | undefined,
  fallback: ImageRatioPreset,
): ImageRatioPreset {
  const dimensions = validImageDimensions(width, height)
  if (!dimensions) return fallback

  const ratio = dimensions.width / dimensions.height
  const candidates: Array<{ preset: ImageRatioPreset; ratio: number }> = [
    { preset: '9:16', ratio: 9 / 16 },
    { preset: '1:1', ratio: 1 },
    { preset: '16:9', ratio: 16 / 9 },
  ]

  return candidates.reduce((closest, candidate) =>
    Math.abs(Math.log(ratio / candidate.ratio)) < Math.abs(Math.log(ratio / closest.ratio))
      ? candidate
      : closest,
  ).preset
}

export function recoverableImageDimensions(
  storedWidth: number | null | undefined,
  storedHeight: number | null | undefined,
  naturalWidth: number | null | undefined,
  naturalHeight: number | null | undefined,
): ImageDimensions | null {
  if (validImageDimensions(storedWidth, storedHeight)) return null
  return validImageDimensions(naturalWidth, naturalHeight)
}

export async function readImageFileDimensions(file: Blob): Promise<ImageDimensions | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      const dimensions = validImageDimensions(bitmap.width, bitmap.height)
      bitmap.close()
      if (dimensions) return dimensions
    } catch {
      // Fall through to the broadly-supported HTMLImageElement path.
    }
  }

  if (
    typeof Image === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) return null

  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<ImageDimensions | null>((resolve) => {
      const image = new Image()
      image.onload = () => resolve(validImageDimensions(image.naturalWidth, image.naturalHeight))
      image.onerror = () => resolve(null)
      image.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
