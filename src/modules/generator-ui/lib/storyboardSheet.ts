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
      ? 'The supplied first frame is the only approved storyboard sheet. Immediately expand panel 1 to full-screen and animate that shot.'
      : `Continue the film with the action planned for panel ${panelNumber}, preserving the approved subject, setting, lighting and style.`,
    'The numbered panels are timing references only. Never show the storyboard grid, panel borders, labels, captions or multiple panels in the rendered shot.',
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
    return { startFrameUrl: params.storyboard.sheetUrl }
  }
  if (params.previousLastFrameUrl) {
    return { startFrameUrl: params.previousLastFrameUrl }
  }
  return null
}

export interface StoryboardPromptPlan {
  scenarioText: string
}

export function storyboardGrid(slotCount: number): { columns: number; rows: number } {
  const slots = Math.max(1, Math.round(slotCount))
  if (slots <= 3) return { columns: slots, rows: 1 }
  if (slots <= 6) return { columns: 2, rows: Math.ceil(slots / 2) }
  return { columns: 3, rows: Math.ceil(slots / 3) }
}

export function buildStoryboardSheetPrompt(params: {
  plans: readonly StoryboardPromptPlan[]
  durationSeconds: number
  aspect: FilmAspect
  allowText?: boolean
}): string {
  if (params.plans.length === 0) throw new Error('Storyboard has no slots')
  const { columns, rows } = storyboardGrid(params.plans.length)
  const panels = params.plans.map((plan, index) =>
    `PANEL ${index + 1} (seconds ${index * 5}-${(index + 1) * 5}): ${plan.scenarioText.trim()}`,
  )
  return [
    'Create ONE single cinematic storyboard contact-sheet image. Do not return separate images.',
    `The finished image must contain exactly ${params.plans.length} equal panels arranged in a ${columns}-column by ${rows}-row grid, read left-to-right and top-to-bottom.`,
    `This storyboard covers one continuous ${params.durationSeconds}-second film. Every panel is exactly one 5-second slot.`,
    `Compose every panel for the final ${params.aspect} film frame while keeping the product, character, location, lighting, color grade and art direction visually consistent across all panels.`,
    params.allowText
      ? 'Separate panels with thin black dividers. Put a clear circular panel number in the top-left corner of each panel. Keep any requested in-scene text inside its own panel. No timestamps, watermarks, extra panels or duplicated panels.'
      : 'Separate panels with thin black dividers. Put only a clear circular panel number in the top-left corner of each panel. No captions, prose, timestamps, watermarks, extra panels or duplicated panels.',
    'Each panel must depict the corresponding moment below:',
    ...panels,
  ].join('\n')
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
