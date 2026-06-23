# Make logo and contact text independent (show whichever is selected)

## Goal
The logo and the contact text must be controlled independently:
- Only logo selected → only the logo appears on the video.
- Only text (website/phone/address) selected → only the text appears.
- Both selected → both appear together.

This reverts the earlier "logo takes over and hides text" behavior.

## Changes (`src/modules/generator-ui/pages/DashboardPage.tsx`, frontend only)
1. **Live preview overlay** (~line 9088): render the contact text lines whenever they exist, regardless of whether the logo is active. Remove the `!contactLogoActive &&` guard so text shows alongside the logo. Restore the logo `marginBottom` spacing logic so the gap is correct when both are present and collapses when text-only.
2. **Burn-in merge call** (~line 6712): pass `lines: contactLines` (drop the `contactLogoActive ? [] : contactLines` override) so the final film shows text and logo independently, matching the toggles.

## Notes
- Logo visibility stays driven by `contactLogoActive` (`Show logo on video` + a logo present).
- Text visibility stays driven by the master `Show on video` switch plus the per-field eye toggles (website/phone/address).
- No data model or backend changes.

## Validation
- Typecheck.
- Preview checks: logo only → logo; text only → text; both on → both.
