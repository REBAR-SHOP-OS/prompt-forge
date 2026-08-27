// Shared initials derivation for avatar fallbacks. Single source of truth so
// the header account avatar and the Account Center dialog render the same
// initials from the same name/email inputs.
export function initialsFor(email: string | undefined | null): string {
  const raw = (email ?? '').trim()
  if (!raw) return '?'
  const local = raw.split('@')[0] ?? ''
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (local[0] ?? '?').toUpperCase()
}

export function initialsForName(first: string, last: string, email: string): string {
  const f = first.trim()[0] ?? ''
  const l = last.trim()[0] ?? ''
  if (f && l) return (f + l).toUpperCase()
  if (f) return f.toUpperCase()
  return initialsFor(email)
}
