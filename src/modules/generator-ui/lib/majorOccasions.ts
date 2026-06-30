// Curated calendar of MAJOR occasions used to decide whether the dashboard
// "Occasion today" badge should turn red. This is intentionally deterministic
// (no AI) so the badge is only red on real, notable days. The calendar dialog
// still uses the AI `day-info` function for full details.

export interface MajorOccasion {
  title: string
  category: 'canada' | 'international' | 'religious'
}

// Fixed-date major occasions (same Gregorian date every year). Key is MM-DD.
const FIXED: Record<string, MajorOccasion> = {
  '01-01': { title: "New Year's Day", category: 'international' },
  '02-14': { title: "Valentine's Day", category: 'international' },
  '03-08': { title: "International Women's Day", category: 'international' },
  '04-22': { title: 'Earth Day', category: 'international' },
  '06-24': { title: 'Saint-Jean-Baptiste Day', category: 'canada' },
  '07-01': { title: 'Canada Day', category: 'canada' },
  '09-30': { title: 'National Day for Truth and Reconciliation', category: 'canada' },
  '10-31': { title: 'Halloween', category: 'international' },
  '11-11': { title: 'Remembrance Day', category: 'canada' },
  '12-25': { title: 'Christmas Day', category: 'religious' },
  '12-31': { title: "New Year's Eve", category: 'international' },
}

// Movable major occasions (mostly religious) with hand-verified Gregorian
// dates. Key is the full date YYYY-MM-DD. Update this table once per year.
const MOVABLE: Record<string, MajorOccasion> = {
  // ---- 2025 ----
  '2025-03-30': { title: 'Eid al-Fitr', category: 'religious' },
  '2025-04-20': { title: 'Easter Sunday', category: 'religious' },
  '2025-06-06': { title: 'Eid al-Adha', category: 'religious' },
  '2025-10-20': { title: 'Diwali', category: 'religious' },
  '2025-05-12': { title: "Mother's Day (Canada/US)", category: 'international' },
  '2025-06-15': { title: "Father's Day (Canada/US)", category: 'international' },
  '2025-10-13': { title: 'Canadian Thanksgiving', category: 'canada' },
  '2025-12-15': { title: 'Hanukkah (Begins)', category: 'religious' },
  // ---- 2026 ----
  '2026-03-20': { title: 'Eid al-Fitr', category: 'religious' },
  '2026-04-05': { title: 'Easter Sunday', category: 'religious' },
  '2026-05-27': { title: 'Eid al-Adha', category: 'religious' },
  '2026-11-08': { title: 'Diwali', category: 'religious' },
  '2026-05-10': { title: "Mother's Day (Canada/US)", category: 'international' },
  '2026-06-21': { title: "Father's Day (Canada/US)", category: 'international' },
  '2026-10-12': { title: 'Canadian Thanksgiving', category: 'canada' },
  '2026-12-04': { title: 'Hanukkah (Begins)', category: 'religious' },
  // ---- 2027 ----
  '2027-03-10': { title: 'Eid al-Fitr', category: 'religious' },
  '2027-03-28': { title: 'Easter Sunday', category: 'religious' },
  '2027-05-16': { title: 'Eid al-Adha', category: 'religious' },
  '2027-10-29': { title: 'Diwali', category: 'religious' },
  '2027-05-09': { title: "Mother's Day (Canada/US)", category: 'international' },
  '2027-06-20': { title: "Father's Day (Canada/US)", category: 'international' },
  '2027-10-11': { title: 'Canadian Thanksgiving', category: 'canada' },
  '2027-12-25': { title: 'Hanukkah (Begins)', category: 'religious' },
}

/** Returns the major occasion for the given date, or null if none. */
export function getMajorOccasionForDate(date: Date): MajorOccasion | null {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const full = `${yyyy}-${mm}-${dd}`
  const md = `${mm}-${dd}`
  return MOVABLE[full] ?? FIXED[md] ?? null
}

export interface UpcomingMajorOccasion {
  occasion: MajorOccasion
  date: Date
  daysAway: number
}

/**
 * Scans forward from `from` (inclusive) through `windowDays` and returns the
 * soonest major occasion, or null if none falls within the window. This lets
 * the dashboard warn the user a few days ahead so they can prepare a film.
 */
export function getUpcomingMajorOccasion(from: Date, windowDays = 3): UpcomingMajorOccasion | null {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let daysAway = 0; daysAway <= windowDays; daysAway += 1) {
    const candidate = new Date(base)
    candidate.setDate(base.getDate() + daysAway)
    const occasion = getMajorOccasionForDate(candidate)
    if (occasion) return { occasion, date: candidate, daysAway }
  }
  return null
}
