# Fix incorrect price display (Fast/Pro & durations > 8s)

## Problem
The price badge (`≈ $X · Y cr`) is computed on the frontend by `estimateGenerationCost` in `src/modules/generator-ui/pages/DashboardPage.tsx`. It multiplies the raw requested seconds by a per-second rate. But the backend (`computeUsd` in `supabase/functions/_shared/modules/external-api-adapter/service.ts`) bills any clip longer than 8s as a fixed **16s** extension chain, and forces Veo Fast above 8s up to Veo 3.1 ($0.40/s). Result: every duration above 8s shows a wrong (too low) price, and Fast/Pro look identical for the wrong reason.

## Goal
Make the displayed estimate exactly equal to what the backend charges, for every duration and both tiers. No backend change — the backend billing is the source of truth; only the frontend estimate is out of sync.

## Change (single function, frontend only)
Rewrite the per-clip cost branch inside `estimateGenerationCost` (lines ~210–222 of `DashboardPage.tsx`) to mirror `computeUsd`:

```text
billedSec = perClipSec > 8 ? 16 : min(8, perClipSec)

flow-video-1 (Fast):
    rate = perClipSec > 8 ? 0.40 : 0.10      // >8s runs on Veo 3.1
    perClipUsd = rate * billedSec
flow-video-1-pro (Pro):
    perClipUsd = 0.40 * billedSec
wan (t2v / i2v):
    perClipUsd = 0.15 (flat, unchanged)
```

`clips`, `perClipSec`, `usd = perClipUsd * clips`, `credits = round(usd*100)` stay as-is.

### Resulting prices (verified against backend)
- 5s Fast $0.50 / Pro $2.00 (unchanged, already correct)
- 10s Fast & Pro $6.40 (was wrongly $4.00)
- 15s Fast & Pro $6.40 (was wrongly $6.00)
- 30s = 2×15s clips → $12.80; 45s = 3×$6.40 = $19.20; 135s = 9×$6.40 = $57.60

This makes the badge match the real charge, and Fast is correctly cheaper than Pro only at ≤8s (where Fast stays on the cheap tier).

## Optional clarity (only if you want it)
Add a tiny hint near the model picker that "Fast above 8s runs on Veo 3.1, so the price matches Pro." I will only add this if you confirm — otherwise I keep the change to the price math alone.

## Technical notes
- Keep the comment block above `estimateGenerationCost` pointing to `COST_MAP_USD` and update it to note the 16s extension-chain billing so the two stay in sync.
- No schema, edge-function, or API changes. Pure presentation fix.
- Verify with a quick unit check of the function for 5/10/15/30/45/135 on both tiers.
