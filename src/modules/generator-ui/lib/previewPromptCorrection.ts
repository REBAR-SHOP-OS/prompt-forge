export function appendPreviewQualityCorrection(prompt: string, correction?: string): string {
  const trimmed = correction?.trim()
  return trimmed ? `${prompt}\n\n${trimmed}` : prompt
}
