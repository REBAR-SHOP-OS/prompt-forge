## Goal
Change the icon on the "Product Ad" button in the composer toolbar from the current box/package icon to a heart icon.

## Change
In `src/modules/generator-ui/pages/DashboardPage.tsx`:

1. Add `Heart` to the existing `lucide-react` import (it currently imports `Package`).
2. At the "Product Ad" button (line ~8211), replace:
   ```tsx
   <Package className="h-5 w-5" aria-hidden="true" />
   ```
   with:
   ```tsx
   <Heart className="h-5 w-5" aria-hidden="true" />
   ```

Other `Package` usages (Product Photos tab, archive panels) stay unchanged — only the composer's "Product Ad" button switches to the heart.

No other behavior, text, or logic changes.