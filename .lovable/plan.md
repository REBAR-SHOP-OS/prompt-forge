# Add per-field on/off toggle for contact fields (address, phone, website)

## Goal
Each contact text field — especially the **address** — should have its own small on/off icon toggle, just like the logo has "Show logo on video". When a field is turned off, it is excluded from the overlay (preview and final film) even if it still has text.

## Current behavior
- A single master switch ("Show on video") enables/disables the whole text block.
- `contactLines` is built from website + phone + address (all non-empty fields), with no per-field control.

## Changes (`src/modules/generator-ui/pages/DashboardPage.tsx`, frontend only)
1. **Type + defaults** (`ContactOverlay`, `emptyContact`): add `websiteEnabled`, `phoneEnabled`, `addressEnabled` booleans, all defaulting to `true`. These persist in localStorage automatically (logoUrl is the only omitted field).
2. **Line filtering** (`contactLines` memo, ~line 1959): include a field only when it is both non-empty AND its per-field flag is on:
   - website → only if `websiteEnabled`
   - phone → only if `phoneEnabled`
   - address → only if `addressEnabled`
3. **Popover UI** (~lines 10752–10778): add a small icon toggle (Eye / EyeOff from lucide-react) on each field's label row, bound to its flag via `updateContact`. Dimmed icon = off. Address gets the toggle the user asked for; website and phone get the same treatment for consistency.

## Notes
- The existing master "Show on video" switch and the logo behavior stay unchanged. Per-field toggles refine which text lines appear when the overlay is on.
- Burn-in already consumes `contactLines`, so the final film honors the toggles with no merge-side change.

## Validation
- Typecheck.
- In preview: toggling the address icon off removes the address line while keeping website/phone; same for the other fields.
