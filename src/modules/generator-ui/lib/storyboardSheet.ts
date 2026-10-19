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

export function buildStoryboardSheetPrompt(params: {
  scenario: string
  panelCount: number
  durationSeconds: number
}): string {
  const panelCount = Math.max(1, Math.round(params.panelCount))
  return [
    `Create ONE cinematic storyboard sheet as a single image for this complete ${params.durationSeconds}-second film.`,
    `The sheet must contain exactly ${panelCount} equal-size panels, read left-to-right and top-to-bottom.`,
    `Each panel represents exactly 5 seconds of consecutive screen time. Panel 1 is 0-5s, panel 2 is 5-10s, and so on.`,
    'Show a clear visual progression from opening hook through development to the final payoff. Keep product, character, environment, lighting and visual style consistent across panels.',
    'HARD INVARIANT — STRICT PANEL SEPARATION: Panels containing the character must be CHARACTER-ONLY, and panels containing the product must be PRODUCT-ONLY HERO SHOTS. Never place the character and product in the same panel or frame. Under no circumstances draw the character or any human hands touching, holding, carrying, placing, sliding, installing, moving, or physically working on the product; hands must never be attached to or reach toward the product. Character-only panels may show a narrator, presenter, observer, or engineer speaking, reacting, looking around, or nodding confidently. Product-only panels may use cinematic macro detail, isolated studio rotation, or show the product already integrated into a finished, fully assembled structure, with no character, person, or human hands visible.',
    'Separate panels with thin black dividers. Put a small, legible number badge in the top-left of every panel, numbered consecutively from 1.',
    'This must be one flat storyboard image, not separate files, not a collage of duplicate frames, and not a contact sheet with captions.',
    `FULL FILM SCENARIO: ${params.scenario.trim()}`,
  ].join('\n\n')
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
    return { startFrameUrl: params.storyboard.sheetUrl }
  }
  if (params.previousLastFrameUrl) {
    return { startFrameUrl: params.previousLastFrameUrl }
  }
  // A storyboard is generated as one AI image. If continuity capture is not
  // available, reuse that single approved sheet rather than inventing another
  // generated frame for this slot.
  return { startFrameUrl: params.storyboard.sheetUrl }
}
