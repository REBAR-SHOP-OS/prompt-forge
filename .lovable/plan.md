## Plan: Clean product name on pick + warn (in English) when it's a technical code

When a product is chosen in "Choose from products", the field is filled with the raw catalog slug including its number (e.g. `rebar_stirrup_005`). We'll strip the number, fill a cleaned name, and show an **English** warning telling the user to type a real product name when the name is just a technical code.

### Changes — `src/modules/generator-ui/components/ProductAdDialog.tsx`

**1. Add a name-cleaning + detection helper**
- `cleanProductName(title)`:
  - Remove trailing numeric suffix (`_005`, `-005`, or trailing ` 005`).
  - Replace `_`/`-` with spaces, collapse whitespace, trim. (`rebar_stirrup_005` → `rebar stirrup`).
- `looksLikeCode(title)`: true when the source title is a technical catalog slug (lowercase tokens joined by `_`/`-` and/or ending in a number, e.g. `rebar_stirrup_005`, `wire_mesh_034`). This is the "unintelligible" signal.

**2. Update `pickProduct` (line ~923)**
- Replace `if (!productName.trim() && photo.title) setProductName(photo.title)` with:
  - `cleaned = cleanProductName(photo.title)`; if field empty, set name to `cleaned` (number removed).
  - If `looksLikeCode(photo.title)`, set a new `nameNeedsReview` flag to show the warning.

**3. Add `nameNeedsReview` state**
- `const [nameNeedsReview, setNameNeedsReview] = useState(false)`.
- Clear it on manual edit of the name Input and on dialog reset (line ~1195).

**4. Show the warning under the Product Name input (line ~1405)**
- When `nameNeedsReview` is true, render a small amber hint below the input.
- **The warning text is always English (not localized):** e.g. "This looks like a technical code — please enter the correct product name."

### Behavior summary
- Pick `rebar_stirrup_005` → field shows `rebar stirrup` (number removed) + English amber warning.
- Typing in the field dismisses the warning.
- No backend / generation-pipeline changes; `productName.trim()` is still what gets sent.