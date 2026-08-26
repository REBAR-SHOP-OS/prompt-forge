import { describe, expect, it } from 'vitest'
import {
  COMPUTED_RULES,
  FIXED,
  VERIFIED,
  VERIFIED_COVERAGE,
  easterSunday,
  fromDateKey,
  getMajorOccasionForDate,
  getOccasionsForDate,
  getOccasionsForMonth,
  getUpcomingMajorOccasion,
  isYearVerified,
  toDateKey,
} from './occasions'
import {
  getUpcomingMajorOccasion as shimUpcoming,
  getMajorOccasionForDate as shimMajor,
} from './majorOccasions'

const d = (key: string) => {
  const parsed = fromDateKey(key)
  if (!parsed) throw new Error(`bad fixture date: ${key}`)
  return parsed
}

const titlesOn = (key: string) => getOccasionsForDate(d(key)).map((o) => o.title)

describe('date helpers', () => {
  it('round-trips a local date key', () => {
    expect(toDateKey(new Date(2026, 7, 26))).toBe('2026-08-26')
    expect(toDateKey(d('2026-01-01'))).toBe('2026-01-01')
  })

  it('rejects malformed and impossible dates', () => {
    expect(fromDateKey('2026-13-01')).toBeNull()
    expect(fromDateKey('2026-02-31')).toBeNull()
    expect(fromDateKey('26-02-01')).toBeNull()
    expect(fromDateKey('')).toBeNull()
  })
})

describe('easterSunday - closed form, no table', () => {
  // Published Gregorian Easter dates.
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2000, '2000-04-23'],
  ])('Easter %i falls on %s', (year, expected) => {
    expect(toDateKey(easterSunday(year as number))).toBe(expected)
  })

  it('always lands on a Sunday, for a century of years', () => {
    for (let year = 1990; year <= 2090; year += 1) {
      expect(easterSunday(year).getDay()).toBe(0)
    }
  })
})

describe('fixed occasions', () => {
  it('resolves the same month/day in any year', () => {
    expect(titlesOn('2025-07-01')).toContain('Canada Day')
    expect(titlesOn('2031-07-01')).toContain('Canada Day')
    expect(titlesOn('2026-12-25')).toContain('Christmas Day')
    expect(titlesOn('2026-11-11')).toContain('Remembrance Day')
  })

  it('returns nothing on an ordinary day', () => {
    expect(getOccasionsForDate(d('2026-08-26'))).toEqual([])
  })
})

describe('computed occasions - the class the old hand table got wrong', () => {
  it("regression: Mother's Day 2025 is Sunday May 11, not May 12", () => {
    // majorOccasions.ts used to hard-code 2025-05-12, which was a Monday.
    expect(titlesOn('2025-05-11')).toContain("Mother's Day (Canada/US)")
    expect(titlesOn('2025-05-12')).not.toContain("Mother's Day (Canada/US)")
  })

  it("Father's Day 2025 is Sunday June 15", () => {
    expect(titlesOn('2025-06-15')).toContain("Father's Day (Canada/US)")
  })

  it.each([
    ['2025-10-13'],
    ['2026-10-12'],
    ['2027-10-11'],
  ])('Canadian Thanksgiving falls on %s', (key) => {
    expect(titlesOn(key)).toContain('Canadian Thanksgiving')
  })
})

describe('computed rules hold as properties, not just on fixture years', () => {
  const YEARS = [2025, 2026, 2027, 2028, 2029, 2030]

  it('Canadian Thanksgiving is always the 2nd Monday of October', () => {
    for (const year of YEARS) {
      const found = getOccasionsForMonth(year, 10).find((o) => o.title === 'Canadian Thanksgiving')
      expect(found, `no Thanksgiving in ${year}`).toBeTruthy()
      const date = d(found!.date)
      expect(date.getDay()).toBe(1)
      expect(date.getDate()).toBeGreaterThanOrEqual(8)
      expect(date.getDate()).toBeLessThanOrEqual(14)
    }
  })

  it('Victoria Day is always the Monday before May 25', () => {
    for (const year of YEARS) {
      const found = getOccasionsForMonth(year, 5).find((o) => o.title === 'Victoria Day')
      expect(found, `no Victoria Day in ${year}`).toBeTruthy()
      const date = d(found!.date)
      expect(date.getDay()).toBe(1)
      expect(date.getDate()).toBeGreaterThanOrEqual(18)
      expect(date.getDate()).toBeLessThanOrEqual(24)
    }
  })

  it('Good Friday is always two days before Easter Sunday', () => {
    for (const year of YEARS) {
      const easter = easterSunday(year)
      const friday = new Date(year, easter.getMonth(), easter.getDate() - 2)
      expect(titlesOn(toDateKey(friday))).toContain('Good Friday')
      expect(friday.getDay()).toBe(5)
    }
  })
})

describe('day view and month view can never disagree', () => {
  // This is the invariant the LLM-computed calendar violated: the month list
  // was generated in one call and the day list in another, so an occasion
  // could appear on May 12 in one panel and May 11 in the other.
  it('month list equals the concatenation of its day lists, for 3 years', () => {
    for (let year = 2025; year <= 2027; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const fromMonth = getOccasionsForMonth(year, month)
        const daysInMonth = new Date(year, month, 0).getDate()
        const fromDays = []
        for (let day = 1; day <= daysInMonth; day += 1) {
          fromDays.push(...getOccasionsForDate(new Date(year, month - 1, day)))
        }
        expect(fromMonth).toEqual(fromDays)
      }
    }
  })

  it('every occasion carries the date it was queried for', () => {
    for (let year = 2025; year <= 2027; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        for (const occasion of getOccasionsForMonth(year, month)) {
          const [y, m] = occasion.date.split('-').map(Number)
          expect(y).toBe(year)
          expect(m).toBe(month)
          expect(titlesOn(occasion.date)).toContain(occasion.title)
        }
      }
    }
  })

  it('never returns two occasions with the same title on one date', () => {
    for (let month = 1; month <= 12; month += 1) {
      for (const occasion of getOccasionsForMonth(2026, month)) {
        const sameTitle = titlesOn(occasion.date).filter((t) => t === occasion.title)
        expect(sameTitle).toHaveLength(1)
      }
    }
  })
})

describe('verified table hygiene', () => {
  it('every hand-verified key is a real date inside the coverage window', () => {
    for (const key of Object.keys(VERIFIED)) {
      const parsed = fromDateKey(key)
      expect(parsed, `unparseable verified key: ${key}`).not.toBeNull()
      const year = Number(key.slice(0, 4))
      expect(isYearVerified(year)).toBe(true)
    }
  })

  it('coverage still includes the current year - extend the table when this fails', () => {
    // Deliberately time-sensitive: this is the alarm that the lunar/observational
    // dates need their annual human refresh. Do not delete it; extend VERIFIED
    // and bump VERIFIED_COVERAGE.lastYear in the same PR.
    expect(isYearVerified(new Date().getFullYear())).toBe(true)
  })

  it('coverage window is ordered', () => {
    expect(VERIFIED_COVERAGE.lastYear).toBeGreaterThanOrEqual(VERIFIED_COVERAGE.firstYear)
  })

  it('tables are internally well-formed', () => {
    for (const [key, occasion] of Object.entries(FIXED)) {
      expect(key).toMatch(/^\d{2}-\d{2}$/)
      expect(occasion.source).toBe('fixed')
      expect(occasion.title.trim()).not.toBe('')
    }
    for (const occasion of Object.values(VERIFIED)) {
      expect(occasion.source).toBe('verified')
    }
    for (const rule of COMPUTED_RULES) {
      expect(typeof rule.resolve(2026).getTime()).toBe('number')
    }
  })
})

describe('badge helpers read the same data as the dialog', () => {
  it('only major occasions turn the badge red', () => {
    expect(getMajorOccasionForDate(d('2026-07-01'))?.title).toBe('Canada Day')
    // World Water Day is a real international day, but not a badge-worthy one.
    expect(titlesOn('2026-03-22')).toContain('World Water Day')
    expect(getMajorOccasionForDate(d('2026-03-22'))).toBeNull()
  })

  it('looks ahead within the window and reports days away', () => {
    const upcoming = getUpcomingMajorOccasion(d('2026-06-29'), 3)
    expect(upcoming?.occasion.title).toBe('Canada Day')
    expect(upcoming?.daysAway).toBe(2)
    // Mid-August has no major occasion within a 3-day window.
    expect(getUpcomingMajorOccasion(d('2026-08-15'), 3)).toBeNull()
  })

  it('the majorOccasions shim still resolves to the same source', () => {
    expect(shimMajor(d('2026-07-01'))?.title).toBe('Canada Day')
    expect(shimUpcoming(d('2026-06-29'), 3)?.occasion.title).toBe('Canada Day')
  })
})
