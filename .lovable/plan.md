# Usage Stats Popover

Add a small icon button in the top header (next to the user email / library) that opens a popover with the user's generation usage and remaining daily/monthly quota.

## What the user sees

Icon: `BarChart3` (or `Gauge`) button in the header.

Popover content:
- **Videos made (total)** — count of completed jobs
- **Credits spent (lifetime)** — sum of `spend` transactions
- **Today**: `used_today / daily_limit_credits` with a progress bar + "X credits left today"
- **This month**: `used_this_month / monthly_limit_credits` with progress bar
- **Remaining videos today** — estimated as `floor(creditsLeftToday / costOfCurrentSelection)` using the same `estimateGenerationCost()` already in `DashboardPage.tsx`. Shows per model:
  - Veo 3 Fast (5s) → N videos
  - Veo 3.1 Pro (5s) → N videos
  - Wan 2.7 (1 clip) → N videos
- **Avg cost per video** — `total_spent / completed_jobs` (lifetime), shown in $ and credits

Refresh button + auto-refresh on open.

## Data source

Read-only — no backend mutations.

Frontend uses existing `supabase` client + tables (already RLS-protected by `auth.uid()`):
1. `core_user_profiles` → `credits_balance`
2. `billing_user_quotas` → `daily_limit_credits, monthly_limit_credits, used_today, used_this_month, last_reset_day, last_reset_month` (with stale-day fallback: if `last_reset_day < today`, treat `used_today` as 0 in the UI; the DB row resets on next job)
3. `billing_credit_transactions` → aggregate `sum(amount) where type='spend'` and `count(*) where type='spend'`
4. `generator_generation_jobs` → `count(*) where status='completed'`

All four queries scoped to current user via RLS. Fired in parallel on popover open.

## Files

- **NEW** `src/modules/generator-ui/components/UsageStatsPopover.tsx` — popover trigger + content, uses shadcn `Popover`, `Progress`, existing `estimateGenerationCost` re-exported from DashboardPage (move it to `src/modules/generator-ui/lib/cost.ts` so both files can import).
- **NEW** `src/modules/generator-ui/lib/cost.ts` — extract `estimateGenerationCost`, `MODEL_CHOICES` pricing map from `DashboardPage.tsx` (same formulas, no behavior change). Confirm dialog and inline badge in DashboardPage import from here.
- **EDIT** `src/modules/generator-ui/pages/DashboardPage.tsx` — import `estimateGenerationCost` from `lib/cost.ts` (remove the inline duplicate). Mount `<UsageStatsPopover />` in the header next to the user email dropdown.

## Technical notes

- No backend / SQL / edge function changes. No new RLS policies needed — all tables already allow `select` for `auth.uid() = user_id`.
- `billing_credit_transactions` aggregations: use `.select('amount', { head: false }).eq('type','spend')` then sum client-side (small per-user volume); if rows grow large later, swap to a SQL view.
- Numbers are estimates; the dialog clearly labels them "≈".
- Stays in frontend only — single source of truth for credit math remains `generator_start_job` on the backend.

## Risk

Very low. Pure read-only UI addition. Refactor of `estimateGenerationCost` into a shared file is a mechanical extraction.
