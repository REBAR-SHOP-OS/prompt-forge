import type { FilmAspect } from './makeFilmWizard'

export interface ApprovedStoryboardSnapshot {
  revision: number
  sheetUrl: string
  scenes: readonly string[]
  shotImageUrls: readonly string[]
}

export function replaceStoryboardPanel(
  images: readonly (string | undefined)[],
  index: number,
  imageUrl: string,
): (string | undefined)[] {
  const next = [...images]
  next[index] = imageUrl
  return next
}

export function createApprovedStoryboardSnapshot(params: {
  revision: number
  sheetUrl: string
  scenes: readonly string[]
  shotImageUrls: readonly string[]
}): ApprovedStoryboardSnapshot {
  return Object.freeze({
    revision: params.revision,
    sheetUrl: params.sheetUrl,
    scenes: Object.freeze([...params.scenes]),
    shotImageUrls: Object.freeze([...params.shotImageUrls]),
  })
}

export function storyboardShotInstruction(
  storyboard: ApprovedStoryboardSnapshot,
  shotIndex: number,
): string {
  const panelNumber = shotIndex + 1
  const startsFromSheet = shotIndex === 0
  return [
    `APPROVED STORYBOARD SHEET REVISION ${storyboard.revision}.`,
    `Follow panel ${panelNumber} of ${storyboard.scenes.length}, read left-to-right and top-to-bottom.`,
    startsFromSheet
      ? 'The supplied first frame is the full storyboard sheet. Immediately expand panel 1 to full-screen and animate that shot.'
      : `Continue the film into panel ${panelNumber} while preserving the approved subject, setting, lighting and style.`,
    'Never show the storyboard grid, panel borders, labels, captions or multiple panels in the rendered shot.',
  ].join(' ')
}

export function storyboardFramesForShot(params: {
  storyboard?: ApprovedStoryboardSnapshot
  shotIndex: number
  previousLastFrameUrl?: string
  approvedShotUrl?: string
}): { startFrameUrl?: string; endFrameUrl?: string } | null {
  if (!params.storyboard) return null
  if (params.shotIndex === 0) {
    return {
      startFrameUrl: params.storyboard.sheetUrl,
      endFrameUrl: params.approvedShotUrl,
    }
  }
  if (params.previousLastFrameUrl) {
    return {
      startFrameUrl: params.previousLastFrameUrl,
      endFrameUrl: params.approvedShotUrl,
    }
  }
  return {
    startFrameUrl: params.approvedShotUrl,
  }
}

function panelDimensions(aspect: FilmAspect): { width: number; height: number } {
  if (aspect === '9:16') return { width: 360, height: 640 }
  if (aspect === '1:1') return { width: 512, height: 512 }
  return { width: 640, height: 360 }
}

async function loadDrawable(url: string): Promise<ImageBitmap | HTMLImageElement> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load storyboard panel (${response.status})`)
  const blob = await response.blob()
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob)

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not decode storyboard panel'))
    }
    image.src = objectUrl
  })
}

export async function buildStoryboardSheetBlob(
  imageUrls: readonly string[],
  aspect: FilmAspect,
): Promise<Blob> {
  if (imageUrls.length === 0) throw new Error('Storyboard has no images')
  const { width: panelWidth, height: panelHeight } = panelDimensions(aspect)
  const columns = Math.min(3, imageUrls.length)
  const rows = Math.ceil(imageUrls.length / columns)
  const canvas = document.createElement('canvas')
  canvas.width = columns * panelWidth
  canvas.height = rows * panelHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Storyboard canvas is unavailable')
  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)

  const drawables = await Promise.all(imageUrls.map(loadDrawable))
  drawables.forEach((drawable, index) => {
    const sourceWidth = drawable.width
    const sourceHeight = drawable.height
    const scale = Math.min(panelWidth / sourceWidth, panelHeight / sourceHeight)
    const width = sourceWidth * scale
    const height = sourceHeight * scale
    const cellX = (index % columns) * panelWidth
    const cellY = Math.floor(index / columns) * panelHeight
    context.drawImage(
      drawable,
      cellX + (panelWidth - width) / 2,
      cellY + (panelHeight - height) / 2,
      width,
      height,
    )
    if ('close' in drawable && typeof drawable.close === 'function') drawable.close()
  })

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode storyboard sheet'))),
      'image/jpeg',
      0.92,
    )
  })
}
