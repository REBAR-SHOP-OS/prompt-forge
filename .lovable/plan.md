# Fix: When the logo is enabled, show only the logo (no contact text)

## Goal
When **"Show logo on video"** is turned on, the overlay must display **only the logo** — the website / phone / address text lines should be hidden, in both the live preview and the burned-in final film.

## Current behavior
The logo and the text lines render together. They are controlled by independent flags:
- `contactLogoActive = logoEnabled && logoUrl` → logo
- text lines come from `contactLines` (website/phone/address)

Both appear at the same time, which is what the user wants changed.

## Changes (`src/modules/generator-ui/pages/DashboardPage.tsx`, frontend only)
1. Compute the effective text lines once: when `contactLogoActive` is true, the text lines are suppressed (empty); otherwise use `contactLines`.
2. **Live preview overlay** (~line 9080 block): render the contact text `<span>` lines only when the logo is NOT active. The logo `<img>` continues to render when `contactLogoActive`.
3. **Burn-in merge call** (~line 6712): pass `lines: contactLogoActive ? [] : contactLines` so the final film matches the preview.

## Notes
- `contactActive` already stays true when only the logo is enabled, so the overlay still renders.
- No data model, popover controls, or backend changes. Both toggles remain; behavior is simply that the logo, when on, takes over the overlay exclusively.

## Validation
- Typecheck.
- Verify in preview: logo on → only logo; logo off (text "Show on video" on) → text lines show as before.
