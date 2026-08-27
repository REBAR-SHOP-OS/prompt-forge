// Single deterministic source of truth for calendar occasions.
//
// WHY THIS FILE EXISTS
// The `day-info` edge function used to ask an LLM to COMPUTE holiday dates.
// Models hallucinate dates, so the day view and the month view disagreed with
// each other, and both disagreed with the hand-maintained badge table in
// `majorOccasions.ts`. Dates are data, not a language task.
//
// Three classes of occasion, in increasing order of how much trust they need:
//   fixed     - same Gregorian month/day every year  -> pure lookup
//   computed  - a calendar rule (nth weekday, Easter offset) -> pure function
//   verified  - lunar/observational, no closed-form rule -> hand-verified
//               table with an explicit coverage window (VERIFIED_COVERAGE)
//
// AI is still used for prose (About / History), never for dates.

export type OccasionCategory = 'canada' | 'international' | 'religious'

export type OccasionSource = 'fixed' | 'computed' | 'verified'

export interface Occasion {
  title: string
  category: OccasionCategory
  /** True when the dashboard badge should treat this as a MAJOR occasion. */
  major: boolean
  source: OccasionSource
}

export interface DatedOccasion extends Occasion {
  /** Gregorian date in local calendar terms, YYYY-MM-DD. */
  date: string
}

/* ------------------------------------------------------------------ */
/* Date helpers - all local-calendar, never UTC, so "today" matches    */
/* what the user sees on the wall calendar.                            */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0')

/** Local-calendar YYYY-MM-DD for a Date. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parses YYYY-MM-DD into a local midnight Date. Returns null if malformed. */
export function fromDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const [, y, mo, d] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  // Reject impossible dates such as 2026-02-31 rolling into March.
  if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null
  return date
}

/** Date of the nth given weekday in a month. weekday: 0=Sun .. 6=Sat. */
function nthWeekday(year: number, month1: number, weekday: number, nth: number): Date {
  const first = new Date(year, month1 - 1, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month1 - 1, 1 + offset + (nth - 1) * 7)
}

/** Last given weekday strictly before `day` of a month (used by Victoria Day). */
function weekdayBefore(year: number, month1: number, day: number, weekday: number): Date {
  const target = new Date(year, month1 - 1, day)
  const back = (target.getDay() - weekday + 7) % 7 || 7
  return new Date(year, month1 - 1, day - back)
}

/**
 * Gregorian Easter Sunday (Anonymous Gregorian / Meeus-Jones-Butcher).
 * Exact for any year in the Gregorian calendar - no table, no guessing.
 */
export function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

/** Easter Sunday shifted by a whole number of days. */
function easterOffset(year: number, days: number): Date {
  const easter = easterSunday(year)
  return new Date(year, easter.getMonth(), easter.getDate() + days)
}

/* ------------------------------------------------------------------ */
/* 1. FIXED - same month/day every year. Key is MM-DD.                 */
/* ------------------------------------------------------------------ */

export const FIXED: Record<string, Occasion> = {
  '01-01': { title: "New Year's Day", category: 'international', major: true, source: 'fixed' },
  '02-14': { title: "Valentine's Day", category: 'international', major: true, source: 'fixed' },
  '03-08': { title: "International Women's Day", category: 'international', major: true, source: 'fixed' },
  '03-20': { title: 'International Day of Happiness', category: 'international', major: false, source: 'fixed' },
  '03-22': { title: 'World Water Day', category: 'international', major: false, source: 'fixed' },
  '04-07': { title: 'World Health Day', category: 'international', major: false, source: 'fixed' },
  '04-22': { title: 'Earth Day', category: 'international', major: true, source: 'fixed' },
  '05-01': { title: "International Workers' Day", category: 'international', major: false, source: 'fixed' },
  '05-03': { title: 'World Press Freedom Day', category: 'international', major: false, source: 'fixed' },
  '06-05': { title: 'World Environment Day', category: 'international', major: false, source: 'fixed' },
  '06-20': { title: 'World Refugee Day', category: 'international', major: false, source: 'fixed' },
  '06-21': { title: 'National Indigenous Peoples Day', category: 'canada', major: true, source: 'fixed' },
  '06-24': { title: 'Saint-Jean-Baptiste Day', category: 'canada', major: true, source: 'fixed' },
  '07-01': { title: 'Canada Day', category: 'canada', major: true, source: 'fixed' },
  '08-12': { title: 'International Youth Day', category: 'international', major: false, source: 'fixed' },
  '09-21': { title: 'International Day of Peace', category: 'international', major: false, source: 'fixed' },
  '09-30': { title: 'National Day for Truth and Reconciliation', category: 'canada', major: true, source: 'fixed' },
  '10-01': { title: 'International Day of Older Persons', category: 'international', major: false, source: 'fixed' },
  '10-31': { title: 'Halloween', category: 'international', major: true, source: 'fixed' },
  '11-11': { title: 'Remembrance Day', category: 'canada', major: true, source: 'fixed' },
  '11-20': { title: "World Children's Day", category: 'international', major: false, source: 'fixed' },
  '12-10': { title: 'Human Rights Day', category: 'international', major: false, source: 'fixed' },
  '12-25': { title: 'Christmas Day', category: 'religious', major: true, source: 'fixed' },
  '12-26': { title: 'Boxing Day', category: 'canada', major: true, source: 'fixed' },
  '12-31': { title: "New Year's Eve", category: 'international', major: true, source: 'fixed' },
}

/* ------------------------------------------------------------------ */
/* 2. COMPUTED - a calendar rule, evaluated for any year.              */
/*    These are the ones the old hand table got wrong: Mother's Day    */
/*    2025 was listed as May 12 (a Monday); the rule gives May 11.     */
/* ------------------------------------------------------------------ */

interface ComputedRule {
  title: string
  category: OccasionCategory
  major: boolean
  resolve: (year: number) => Date
}

export const COMPUTED_RULES: ComputedRule[] = [
  { title: 'Family Day', category: 'canada', major: true, resolve: (y) => nthWeekday(y, 2, 1, 3) },
  { title: 'Ash Wednesday', category: 'religious', major: false, resolve: (y) => easterOffset(y, -46) },
  { title: 'Good Friday', category: 'religious', major: true, resolve: (y) => easterOffset(y, -2) },
  { title: 'Easter Sunday', category: 'religious', major: true, resolve: (y) => easterSunday(y) },
  { title: 'Easter Monday', category: 'religious', major: false, resolve: (y) => easterOffset(y, 1) },
  { title: 'Pentecost', category: 'religious', major: false, resolve: (y) => easterOffset(y, 49) },
  { title: "Mother's Day (Canada/US)", category: 'international', major: true, resolve: (y) => nthWeekday(y, 5, 0, 2) },
  { title: 'Victoria Day', category: 'canada', major: true, resolve: (y) => weekdayBefore(y, 5, 25, 1) },
  { title: "Father's Day (Canada/US)", category: 'international', major: true, resolve: (y) => nthWeekday(y, 6, 0, 3) },
  { title: 'Civic Holiday', category: 'canada', major: false, resolve: (y) => nthWeekday(y, 8, 1, 1) },
  { title: 'Labour Day', category: 'canada', major: true, resolve: (y) => nthWeekday(y, 9, 1, 1) },
  { title: 'Canadian Thanksgiving', category: 'canada', major: true, resolve: (y) => nthWeekday(y, 10, 1, 2) },
]

/* ------------------------------------------------------------------ */
/* 3. VERIFIED - lunar / observational, no closed-form rule.           */
/*    Carried over unchanged from the previously hand-verified table   */
/*    in majorOccasions.ts. Dates here are HUMAN-VERIFIED, never       */
/*    model-generated. Extend once per year and update                 */
/*    VERIFIED_COVERAGE in the same commit; `occasions.test.ts` fails  */
/*    when the current year falls outside the window.                  */
/* ------------------------------------------------------------------ */

export const VERIFIED_COVERAGE = { firstYear: 2025, lastYear: 2027 } as const

export const VERIFIED: Record<string, Occasion> = {
  '2025-03-30': { title: 'Eid al-Fitr', category: 'religious', major: true, source: 'verified' },
  '2025-06-06': { title: 'Eid al-Adha', category: 'religious', major: true, source: 'verified' },
  '2025-10-20': { title: 'Diwali', category: 'religious', major: true, source: 'verified' },
  '2025-12-15': { title: 'Hanukkah (Begins)', category: 'religious', major: true, source: 'verified' },

  '2026-03-20': { title: 'Eid al-Fitr', category: 'religious', major: true, source: 'verified' },
  '2026-05-27': { title: 'Eid al-Adha', category: 'religious', major: true, source: 'verified' },
  '2026-11-08': { title: 'Diwali', category: 'religious', major: true, source: 'verified' },
  '2026-12-04': { title: 'Hanukkah (Begins)', category: 'religious', major: true, source: 'verified' },

  '2027-03-10': { title: 'Eid al-Fitr', category: 'religious', major: true, source: 'verified' },
  '2027-05-16': { title: 'Eid al-Adha', category: 'religious', major: true, source: 'verified' },
  '2027-10-29': { title: 'Diwali', category: 'religious', major: true, source: 'verified' },
  '2027-12-25': { title: 'Hanukkah (Begins)', category: 'religious', major: true, source: 'verified' },
}

/**
 * Deliberately NOT listed above: Ramadan (start), Rosh Hashanah, Yom Kippur,
 * Passover, Holi, Vesak, Vaisakhi. They belong in the three allowed
 * categories, but this change refuses to introduce dates that no human on the
 * team has verified - that is the exact failure mode being removed. Add them
 * by hand, with a source, and extend the tests in the same PR.
 */
export const PENDING_VERIFICATION: readonly string[] = [
  'Ramadan (Begins)', 'Rosh Hashanah', 'Yom Kippur', 'Passover (Begins)', 'Holi', 'Vesak', 'Vaisakhi',
]

/* ------------------------------------------------------------------ */
/* Queries. Day and month read the SAME three tables, which is what    */
/* makes the two views agree by construction.                          */
/* ------------------------------------------------------------------ */

/** Every occasion falling on `date`, ordered fixed -> computed -> verified. */
export function getOccasionsForDate(date: Date): DatedOccasion[] {
  const key = toDateKey(date)
  const monthDay = key.slice(5)
  const year = date.getFullYear()
  const out: DatedOccasion[] = []

  const fixed = FIXED[monthDay]
  if (fixed) out.push({ ...fixed, date: key })

  for (const rule of COMPUTED_RULES) {
    if (toDateKey(rule.resolve(year)) !== key) continue
    out.push({
      title: rule.title, category: rule.category, major: rule.major, source: 'computed', date: key,
    })
  }

  const verified = VERIFIED[key]
  if (verified) out.push({ ...verified, date: key })

  return out
}

/** Every occasion in a calendar month. `month1` is 1-12. Sorted by date. */
export function getOccasionsForMonth(year: number, month1: number): DatedOccasion[] {
  const daysInMonth = new Date(year, month1, 0).getDate()
  const out: DatedOccasion[] = []
  for (let day = 1; day <= daysInMonth; day += 1) {
    out.push(...getOccasionsForDate(new Date(year, month1 - 1, day)))
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/* ------------------------------------------------------------------ */
/* Badge helpers - the dashboard "Occasion today" badge turns red only */
/* for MAJOR occasions. Same data as the calendar dialog, so the badge */
/* and the dialog can no longer disagree.                              */
/* ------------------------------------------------------------------ */

/** The major occasion for a date, or null. Fixed/computed/verified alike. */
export function getMajorOccasionForDate(date: Date): DatedOccasion | null {
  return getOccasionsForDate(date).find((o) => o.major) ?? null
}

export interface UpcomingMajorOccasion {
  occasion: DatedOccasion
  date: Date
  daysAway: number
}

/**
 * Soonest major occasion from `from` (inclusive) within `windowDays`, so the
 * dashboard can warn a few days ahead and the user can prepare a film.
 */
export function getUpcomingMajorOccasion(from: Date, windowDays = 3): UpcomingMajorOccasion | null {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  for (let daysAway = 0; daysAway <= windowDays; daysAway += 1) {
    const candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate() + daysAway)
    const occasion = getMajorOccasionForDate(candidate)
    if (occasion) return { occasion, date: candidate, daysAway }
  }
  return null
}

/** True when `year` is inside the hand-verified coverage window. */
export function isYearVerified(year: number): boolean {
  return year >= VERIFIED_COVERAGE.firstYear && year <= VERIFIED_COVERAGE.lastYear
}
