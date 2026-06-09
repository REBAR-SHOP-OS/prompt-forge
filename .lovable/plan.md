## Goal

1. The calendar/"Occasion today" icon must turn **red only on days that genuinely have an occasion** — no more AI false positives like the bogus "Eid al-Adha" shown today.
2. The calendar must **always list all occasions accurately**, especially **Canadian holidays**, with correct dates.

## Root cause

`supabase/functions/day-info/index.ts` asks an AI model to both *find* occasions and *compute their dates*. The model hallucinates and misplaces movable holidays (confirmed: it returned Eid al-Adha on 2026-06-09, which is wrong). The red dot in `DashboardPage.tsx` (`hasOccasionToday`) and the calendar lists both consume this unreliable output directly.

## Approach

Make occasion **presence and dates deterministic**, and use AI only to write the descriptive text. This removes hallucinated red dots and guarantees Canadian accuracy.

### 1. New deterministic occasions dataset (edge side)

Add `supabase/functions/_shared/occasions.ts` that, given a year, returns a typed list `{ date, title, category }`:

- **Canada (computed each year):** New Year's Day, Family Day (3rd Mon Feb), Good Friday (computus), Victoria Day (Mon before May 25), Canada Day (Jul 1), Civic Holiday (1st Mon Aug), Labour Day (1st Mon Sep), National Day for Truth and Reconciliation (Sep 30), Thanksgiving (2nd Mon Oct), Remembrance Day (Nov 11), Christmas (Dec 25), Boxing Day (Dec 26). Plus Saint-Jean-Baptiste (Jun 24) tagged Canada.
- **International (fixed/computed):** New Year, Valentine's Day, International Women's Day, Earth Day, World Health/Environment Day, International Day of Peace, Human Rights Day, Halloween, Mother's Day (2nd Sun May), Father's Day (3rd Sun Jun).
- **Religious:** Easter & related (Ash Wednesday, Good Friday, Easter, Pentecost) via the computus algorithm; Christmas/Epiphany/All Saints fixed. For lunar-calendar holidays (Eid al-Fitr, Eid al-Adha, Ramadan start, Rosh Hashanah, Yom Kippur, Hanukkah, Passover, Diwali, Holi, Vesak, Vaisakhi) use a **maintained lookup table for 2025–2028** with verified Gregorian dates (no AI guessing). Years outside the table simply omit those movable entries rather than guess.

### 2. Rework `day-info` to be data-driven

- **Day mode** (`{ date }`): filter the dataset to that exact date. If none → return empty (icon stays not-red). If matches exist, call the AI **only** to generate `whatItIs` + `history` for those specific, named occasions (so it can't invent or move dates).
- **Month mode** (`{ month }`): filter the dataset to that month, return all entries (with a short AI-written one-liner each, or a fast static blurb). Dates come from the dataset, never the model.
- Keep the existing response shape (`{ occasions: [...] , lang }`) so the frontend needs no contract change.

### 3. Frontend red-dot correctness

In `DashboardPage.tsx` (`hasOccasionToday` effect):
- Keep the per-day localStorage cache but **bump the cache key version** (e.g. `occasion-today-v2:<date>`) so today's stale `'1'` is discarded for every user.
- Logic stays: red only when `occasions.length > 0` — now reliable because the source is deterministic.

No visual/styling changes to the button itself.

## Files touched

- `supabase/functions/_shared/occasions.ts` (new — deterministic dataset + helpers)
- `supabase/functions/day-info/index.ts` (rewrite to use the dataset; AI only for prose)
- `src/modules/generator-ui/pages/DashboardPage.tsx` (bump occasion-today cache key)

## Verification

- Call `day-info` for 2026-06-09 → expect **empty** occasions (icon not red).
- Call for 2026-07-01 → expect **Canada Day**.
- Call month mode for 2026-07 → expect Canada Day on the 1st; spot-check other Canadian months (Feb Family Day, May Victoria Day, Oct Thanksgiving).
- Reload preview and confirm the calendar icon is no longer red today.

## Note / tradeoff

Lunar-calendar religious holidays are only accurate for the years in the maintained table (2025–2028). When a new year approaches, that table needs a quick update. This is the price of eliminating AI date hallucinations — fixed/computed holidays (all Canadian ones) are always correct.