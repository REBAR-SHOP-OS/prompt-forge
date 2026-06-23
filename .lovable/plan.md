# Plan: Contact Overlay Off by Default

## Problem
The Contact overlay button in the bottom toolbar can appear "on" (active/emerald styling) when the user returns to the app, because the `enabled` flag is persisted in `localStorage`. The user wants it to always start in the "off" state in normal/default mode.

## Changes

### `src/modules/generator-ui/pages/DashboardPage.tsx`

In the `useEffect` that loads contact state from `localStorage` (around line 1871), after merging the saved state with `emptyContact()`, explicitly override `enabled` back to `false`:

```typescript
let base = emptyContact()
try {
  const raw = window.localStorage.getItem(contactKey)
  if (raw) base = { ...base, ...(JSON.parse(raw) as Partial<ContactOverlay>), enabled: false }
} catch { /* ignore */ }
```

This preserves all saved contact text (website, phone, address, logo, theme, position) but ensures the overlay is always **disabled** on app load. The user must explicitly toggle "Show on video" in the popover to turn it on.

No other files need changes. The save logic stays unchanged — users can still turn it on during a session and it will persist until the next full page reload, at which point it resets to off again.
