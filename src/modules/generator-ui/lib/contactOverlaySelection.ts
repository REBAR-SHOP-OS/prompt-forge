export interface ContactOverlaySelectionInput {
  textEnabled: boolean
  lines: string[]
  logoEnabled: boolean
  logoUrl: string
  panelEnabled: boolean
}

export interface ActiveContactOverlaySelection {
  active: boolean
  lines: string[]
  logoUrl?: string
  panelEnabled: boolean
}

/**
 * Resolve the independently controlled contact text and logo layers.
 * The panel is a text backdrop, so logo-only mode never paints it.
 */
export function selectActiveContactOverlay(
  input: ContactOverlaySelectionInput,
): ActiveContactOverlaySelection {
  const lines = input.textEnabled
    ? input.lines.map((line) => line.trim()).filter(Boolean)
    : []
  const logoUrl = input.logoEnabled && input.logoUrl.trim()
    ? input.logoUrl
    : undefined
  const hasText = lines.length > 0

  return {
    active: hasText || Boolean(logoUrl),
    lines,
    logoUrl,
    panelEnabled: hasText && input.panelEnabled,
  }
}
