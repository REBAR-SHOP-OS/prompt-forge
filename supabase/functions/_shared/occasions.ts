// Deterministic occasions dataset.
// Presence + dates are computed/curated here (NEVER guessed by AI) so the
// "Occasion today" red dot is accurate and Canadian holidays are always correct.

export type OccasionCategory = 'canada' | 'international' | 'religious'

export interface DatasetOccasion {
  date: string // YYYY-MM-DD
  title: string
  category: OccasionCategory
}

const iso = (y: number, m: number, d: number): string =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// Nth weekday of a month. weekday: 0=Sun..6=Sat. n is 1-based.
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const offset = (weekday - first + 7) % 7
  return 1 + offset + (n - 1) * 7
}

// Last given weekday of a month.
function lastWeekday(year: number, month: number, weekday: number): number {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const last = new Date(Date.UTC(year, month - 1, daysInMonth)).getUTCDay()
  const offset = (last - weekday + 7) % 7
  return daysInMonth - offset
}

// Victoria Day: the Monday preceding May 25.
function victoriaDay(year: number): number {
  // Find Monday on/before May 24.
  for (let d = 24; d >= 18; d--) {
    if (new Date(Date.UTC(year, 4, d)).getUTCDay() === 1) return d
  }
  return 24
}

// Western (Gregorian) Easter Sunday via the Anonymous Gregorian computus.
function easterDate(year: number): { month: number; day: number } {
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
  return { month, day }
}

function addDays(year: number, month: number, day: number, delta: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

// Curated lunar-calendar religious holidays (verified Gregorian dates).
// Years outside this table are omitted rather than guessed.
const LUNAR_RELIGIOUS: Record<number, Array<{ date: string; title: string }>> = {
  2025: [
    { date: '2025-03-01', title: 'Ramadan (Begins)' },
    { date: '2025-03-31', title: 'Eid al-Fitr' },
    { date: '2025-06-07', title: 'Eid al-Adha' },
    { date: '2025-03-14', title: 'Purim' },
    { date: '2025-04-13', title: 'Passover (Begins)' },
    { date: '2025-09-23', title: 'Rosh Hashanah' },
    { date: '2025-10-02', title: 'Yom Kippur' },
    { date: '2025-12-15', title: 'Hanukkah (Begins)' },
    { date: '2025-03-14', title: 'Holi' },
    { date: '2025-10-21', title: 'Diwali' },
    { date: '2025-05-12', title: 'Vesak (Buddha Day)' },
    { date: '2025-04-13', title: 'Vaisakhi' },
  ],
  2026: [
    { date: '2026-02-18', title: 'Ramadan (Begins)' },
    { date: '2026-03-20', title: 'Eid al-Fitr' },
    { date: '2026-05-27', title: 'Eid al-Adha' },
    { date: '2026-03-03', title: 'Purim' },
    { date: '2026-04-02', title: 'Passover (Begins)' },
    { date: '2026-09-12', title: 'Rosh Hashanah' },
    { date: '2026-09-21', title: 'Yom Kippur' },
    { date: '2026-12-05', title: 'Hanukkah (Begins)' },
    { date: '2026-03-04', title: 'Holi' },
    { date: '2026-11-08', title: 'Diwali' },
    { date: '2026-05-31', title: 'Vesak (Buddha Day)' },
    { date: '2026-04-14', title: 'Vaisakhi' },
  ],
  2027: [
    { date: '2027-02-08', title: 'Ramadan (Begins)' },
    { date: '2027-03-10', title: 'Eid al-Fitr' },
    { date: '2027-05-16', title: 'Eid al-Adha' },
    { date: '2027-03-23', title: 'Purim' },
    { date: '2027-04-22', title: 'Passover (Begins)' },
    { date: '2027-10-02', title: 'Rosh Hashanah' },
    { date: '2027-10-11', title: 'Yom Kippur' },
    { date: '2027-12-25', title: 'Hanukkah (Begins)' },
    { date: '2027-03-22', title: 'Holi' },
    { date: '2027-10-29', title: 'Diwali' },
    { date: '2027-05-20', title: 'Vesak (Buddha Day)' },
    { date: '2027-04-14', title: 'Vaisakhi' },
  ],
  2028: [
    { date: '2028-01-28', title: 'Ramadan (Begins)' },
    { date: '2028-02-26', title: 'Eid al-Fitr' },
    { date: '2028-05-05', title: 'Eid al-Adha' },
    { date: '2028-03-12', title: 'Purim' },
    { date: '2028-04-11', title: 'Passover (Begins)' },
    { date: '2028-09-21', title: 'Rosh Hashanah' },
    { date: '2028-09-30', title: 'Yom Kippur' },
    { date: '2028-12-13', title: 'Hanukkah (Begins)' },
    { date: '2028-03-11', title: 'Holi' },
    { date: '2028-10-17', title: 'Diwali' },
    { date: '2028-05-09', title: 'Vesak (Buddha Day)' },
    { date: '2028-04-13', title: 'Vaisakhi' },
  ],
}

// Build the full occasion list for a given year.
export function occasionsForYear(year: number): DatasetOccasion[] {
  const out: DatasetOccasion[] = []
  const add = (date: string, title: string, category: OccasionCategory) =>
    out.push({ date, title, category })

  // ---- Canada (statutory + widely observed) ----
  add(iso(year, 1, 1), "New Year's Day", 'canada')
  add(iso(year, 2, nthWeekday(year, 2, 1, 3)), 'Family Day', 'canada') // 3rd Mon Feb
  add(iso(year, 5, victoriaDay(year)), 'Victoria Day', 'canada')
  add(iso(year, 6, 24), 'Saint-Jean-Baptiste Day', 'canada')
  add(iso(year, 7, 1), 'Canada Day', 'canada')
  add(iso(year, 8, nthWeekday(year, 8, 1, 1)), 'Civic Holiday', 'canada') // 1st Mon Aug
  add(iso(year, 9, nthWeekday(year, 9, 1, 1)), 'Labour Day', 'canada') // 1st Mon Sep
  add(iso(year, 9, 30), 'National Day for Truth and Reconciliation', 'canada')
  add(iso(year, 10, nthWeekday(year, 10, 1, 2)), 'Thanksgiving (Canada)', 'canada') // 2nd Mon Oct
  add(iso(year, 11, 11), 'Remembrance Day', 'canada')
  add(iso(year, 12, 25), 'Christmas Day', 'canada')
  add(iso(year, 12, 26), 'Boxing Day', 'canada')

  // ---- International (fixed + computed) ----
  add(iso(year, 2, 14), "Valentine's Day", 'international')
  add(iso(year, 3, 8), "International Women's Day", 'international')
  add(iso(year, 4, 7), 'World Health Day', 'international')
  add(iso(year, 4, 22), 'Earth Day', 'international')
  add(iso(year, 5, 5), 'Cinco de Mayo', 'international')
  add(iso(year, 5, nthWeekday(year, 5, 0, 2)), "Mother's Day", 'international') // 2nd Sun May
  add(iso(year, 6, 5), 'World Environment Day', 'international')
  add(iso(year, 6, nthWeekday(year, 6, 0, 3)), "Father's Day", 'international') // 3rd Sun Jun
  add(iso(year, 9, 21), 'International Day of Peace', 'international')
  add(iso(year, 10, 31), 'Halloween', 'international')
  add(iso(year, 12, 10), 'Human Rights Day', 'international')
  add(iso(year, 12, 31), "New Year's Eve", 'international')

  // ---- Religious (computed via Easter computus + fixed days) ----
  const easter = easterDate(year)
  add(iso(year, 1, 6), 'Epiphany', 'religious')
  add(addDays(year, easter.month, easter.day, -46), 'Ash Wednesday', 'religious')
  add(addDays(year, easter.month, easter.day, -2), 'Good Friday', 'religious')
  add(iso(year, easter.month, easter.day), 'Easter Sunday', 'religious')
  add(addDays(year, easter.month, easter.day, 49), 'Pentecost', 'religious')
  add(iso(year, 11, 1), "All Saints' Day", 'religious')
  add(iso(year, 12, 25), 'Christmas Day', 'religious')

  // ---- Lunar-calendar religious (curated table) ----
  for (const item of LUNAR_RELIGIOUS[year] ?? []) {
    add(item.date, item.title, 'religious')
  }

  return out
}

// Occasions on an exact date (YYYY-MM-DD).
export function occasionsForDate(dateIso: string): DatasetOccasion[] {
  const year = Number(dateIso.slice(0, 4))
  if (!Number.isFinite(year)) return []
  return occasionsForYear(year).filter((o) => o.date === dateIso)
}

// Occasions within a month (YYYY-MM), sorted by date.
export function occasionsForMonth(monthIso: string): DatasetOccasion[] {
  const year = Number(monthIso.slice(0, 4))
  if (!Number.isFinite(year)) return []
  return occasionsForYear(year)
    .filter((o) => o.date.startsWith(monthIso))
    .sort((a, b) => a.date.localeCompare(b.date))
}
