# Calendar / Occasions Feature

Add a calendar icon button to the dashboard's top-left rail (right under the existing `LayoutGrid` icon, where the user marked the orange circle). Clicking it opens a full-screen dialog where the user can browse a Gregorian calendar, see which days have international occasions, and read full details about any selected day.

## UX

- New fixed icon button at `left-4 top-16` (just below the LayoutGrid at `top-4`), same neutral hover styling as the existing rail icon. Uses `CalendarDays` from `lucide-react`.
- Click → opens `OccasionsDialog` (full-screen `Dialog` with `max-w-6xl`, dark theme matching the dashboard).
- Dialog layout (two columns):
  - **Left (≈55%)**: Month calendar grid (built on `react-day-picker` via existing `@/components/ui/calendar`). Days that have at least one occasion get a small colored dot underneath the date number. Month/year navigation in header. Defaults to today, today is highlighted.
  - **Right (≈45%)**: Details panel for the selected day:
    - Big date heading (e.g. "May 11, 2026 — Monday")
    - List of occasions for that day from the static dataset, each with: name, category badge (International / UN / Awareness / Cultural), short one-line description.
    - "Get full details" button → calls Lovable AI and streams a richer write-up (history, significance, how it's observed, suggested content angles for video creators). Result is rendered as markdown below the list. Cached per-date in component state for the session.
    - If the day has no static occasions, show "No notable international occasion. Ask AI for context →" button which calls the same edge function with an "any-notable-event" prompt.

## Data sources (hybrid)

1. **Static dataset** — `src/modules/generator-ui/data/occasions.ts` exports `OCCASIONS: Record<"MM-DD", Occasion[]>` covering ~120 well-known international/UN/awareness days (e.g. 01-01 New Year, 03-08 International Women's Day, 04-22 Earth Day, 06-05 World Environment Day, 12-10 Human Rights Day, full UN International Days list, etc.). No external API, instant lookup.
2. **Lovable AI** — new edge function `occasion-details` calls the Lovable AI Gateway (`google/gemini-2.5-flash`) with the date + known occasion names, returning a structured detailed write-up. Auth-required, rate-limited via existing `core/ratelimit.ts` pattern.

## Files to add

- `src/modules/generator-ui/data/occasions.ts` — static dataset + `getOccasionsFor(date)` helper.
- `src/modules/generator-ui/components/OccasionsDialog.tsx` — the full-screen dialog (calendar + details panel + AI fetch).
- `supabase/functions/occasion-details/index.ts` — edge function that calls `LOVABLE_API_KEY` gateway and returns `{ markdown }`.

## Files to edit

- `src/modules/generator-ui/pages/DashboardPage.tsx` — import `CalendarDays`, add the new fixed button under the LayoutGrid icon, wire `isOccasionsOpen` state, mount `<OccasionsDialog open={...} onOpenChange={...} />`.

## Technical notes

- Calendar dot indicator: pass a custom `DayContent` to `react-day-picker` that renders the dot when `getOccasionsFor(date).length > 0`.
- AI call uses `supabase.functions.invoke("occasion-details", { body: { isoDate, knownOccasions } })`. Edge function uses `LOVABLE_API_KEY` (already configured for Lovable AI), no new secret needed.
- Edge function added to `supabase/config.toml` is automatic; `verify_jwt` stays default (true) so only signed-in users can call.
- All colors via design tokens (`bg-background`, `border-border`, `text-foreground`, `bg-primary`); no hardcoded hex.
- Markdown rendering: lightweight — split paragraphs and render headings/bullets manually (no new dependency) to keep bundle small.

## Out of scope

- No Persian/Hijri calendar conversion (user chose international Gregorian only).
- No persistence of viewed occasions to the database.
- No notifications or reminders.