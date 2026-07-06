## Plan: Linear text display in prompt input

### Problem
The prompt input textarea currently wraps text across multiple lines (`rows={3}`, `min-h-24`, `leading-6`). The user wants text to display in a single horizontal line with horizontal scrolling instead.

### Changes
1. **In `DashboardPage.tsx` (prompt textarea):**
   - Change from multi-line textarea behavior to single-line horizontal scrolling.
   - Add `overflow-x-auto overflow-y-hidden whitespace-nowrap` to prevent wrapping and enable horizontal scroll.
   - Reduce height back to single-line (`min-h-10`, `max-h-10`) and remove `resize-y`.
   - Keep the element as `<textarea>` for consistency, but style it as a single-line input.

### Risks
- Very low. Purely presentational CSS change on one element.
- No data flow or logic changes.
