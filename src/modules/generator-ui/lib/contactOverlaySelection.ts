export interface ContactOverlaySelectionInput {
  textEnabled: boolean
  lines: string[]
  logoEnabled: boolean
  /** Persisted browser data is untrusted at runtime, despite its TS shape. */
  logoUrl: unknown
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
  const normalizedLogoUrl = typeof input.logoUrl === 'string'
    ? input.logoUrl.trim()
    : ''
  const logoUrl = input.logoEnabled && normalizedLogoUrl
    ? normalizedLogoUrl
    : undefined
  const hasText = lines.length > 0

  return {
    active: hasText || Boolean(logoUrl),
    lines,
    logoUrl,
    panelEnabled: hasText && input.panelEnabled,
  }
}
