// SUPERSEDED as a data source. The curated tables that used to live here were
// a second, divergent copy of the calendar: the badge read this file while the
// dialog read whatever the `day-info` LLM returned, so the two disagreed - and
// some hand-entered movable dates were simply wrong (Mother's Day 2025 was
// listed as May 12, a Monday; the rule gives May 11).
//
// There is now ONE deterministic source: `./occasions.ts`. This module stays
// as a thin re-export so existing imports keep working.
//
// Do not add dates here. Add them to `occasions.ts` and cover them with tests.

export type {
  OccasionCategory,
  Occasion,
  DatedOccasion,
  UpcomingMajorOccasion,
} from './occasions'

export {
  getMajorOccasionForDate,
  getUpcomingMajorOccasion,
} from './occasions'

/** @deprecated Use `Occasion` from `./occasions`. */
export type { Occasion as MajorOccasion } from './occasions'
