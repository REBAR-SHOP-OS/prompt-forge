# Show upcoming occasions ahead of time

Today the calendar badge only turns red when the current day is a major occasion. This change makes it warn the user up to **3 days in advance** (today + next 3 days) so there is time to create a film, and labels it with the occasion name and how many days remain (e.g. "Eid al-Fitr in 2 days").

## 1. Add a lookahead helper — `src/modules/generator-ui/lib/majorOccasions.ts`

Add a new function that scans from today forward through a window and returns the soonest occasion:

```text
getUpcomingMajorOccasion(from: Date, windowDays = 3)
  -> { occasion: MajorOccasion, date: Date, daysAway: number } | null
```

- Loop `daysAway` from 0 to `windowDays`, build the candidate date, reuse the existing `getMajorOccasionForDate`, and return the first match (closest day wins).
- `daysAway === 0` means today, `1` means tomorrow, etc.
- Keep the existing `getMajorOccasionForDate` untouched so nothing else breaks.

## 2. Update the badge state — `src/modules/generator-ui/pages/DashboardPage.tsx`

- Replace the `hasOccasionToday` boolean (line 1819) with a richer state holding the upcoming result, e.g. `upcomingOccasion: { title, daysAway } | null`.
- In the daily-check effect (around line 1823-1826), call `getUpcomingMajorOccasion(new Date(), 3)` and store the result.
- Derive `hasOccasionToday`-style flags from it where needed:
  - `isAlert = upcomingOccasion !== null`
  - keep the red styling for an alert, emerald when there is nothing upcoming.

## 3. Update the badge UI (lines 8580-8614)

- Drive the red/emerald styling, ping dot, `aria-label`, and `title` from `isAlert` instead of `hasOccasionToday`.
- Build a label string from `upcomingOccasion`:
  - `daysAway === 0` -> `"<Name> today"`
  - `daysAway === 1` -> `"<Name> tomorrow"`
  - otherwise -> `"<Name> in <daysAway> days"`
  - no upcoming -> `"No occasion"`
- Show this label in the existing `2xl:inline` text span; use it for the `title`/`aria-label` tooltip so it is visible even when the text is hidden on smaller widths.

## Technical notes

- Pure date math, deterministic, no AI and no backend changes — only the curated `majorOccasions.ts` table is used.
- The calendar dialog (`CalendarInfoDialog`) is unchanged; clicking the badge still opens it.
- TypeScript must stay clean; the new state type replaces the old boolean in all referenced sites (lines 1819, 1826, 8584-8612).
