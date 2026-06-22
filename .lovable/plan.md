## Plan: Only warn when the resulting name actually looks wrong

The warning currently checks the raw catalog title (e.g. `rebar_stirrup_005`), which always looks like a code — so even after cleaning to a readable "rebar stirrup", the warning still shows. Fix: validate the cleaned name placed in the field, not the raw title.

### Change — `src/modules/generator-ui/components/ProductAdDialog.tsx`

**1. `looksLikeCode` — evaluate the cleaned name**
- Detect a name still problematic after cleaning:
  - empty/whitespace, or
  - still contains code separators / leftover digits (`_`, `-`, or embedded digits), or
  - a single gibberish token with no readable word.
- A normal cleaned name with real words and spaces (e.g. "rebar stirrup") returns `false` → no warning.

**2. `pickProduct` (line ~944)**
- Compute `cleaned = cleanProductName(photo.title)`.
- Set the field to `cleaned`.
- `setNameNeedsReview(looksLikeCode(cleaned))` — check the cleaned value instead of `photo.title`.

### Result
- Pick `rebar_stirrup_005` → field "rebar stirrup", no warning.
- Pick something still code-like after cleaning (e.g. `sku9931x`, leftover digits/garbled) → warning shown.