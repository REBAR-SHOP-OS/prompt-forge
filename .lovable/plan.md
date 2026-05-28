## Problem

When closing the "Today's Occasions" dialog, the full Calendar layout (with the date grid + month list + scenario columns) flashes for a few hundredths of a second before the dialog fully disappears.

## Root cause

In `DashboardPage.tsx` (line 4529):

```tsx
onOpenChange={(o) => { setIsCalendarOpen(o); if (!o) setCalendarTodayOnly(false) }}
```

Radix `Dialog` plays a fade-out animation when `open` flips to `false`. During that animation the dialog is still mounted and visible. We immediately set `calendarTodayOnly = false`, which switches the layout from the 2-column "Today's Occasions" view to the full 4-column "Calendar" view — visible for the duration of the close animation, hence the flash.

## Fix

Stop resetting `calendarTodayOnly` synchronously on close. The flag is already explicitly set to the correct value at every open site:
- Auto-open after login → sets `true`
- Manual calendar icon click → sets `false` before opening
- `onApplyPrompt` → also resets it

So the on-close reset is redundant and is the sole cause of the flash. Remove it (or defer it via `setTimeout` after the animation, ~250 ms). Preferred: just remove it.

### Edit

`src/modules/generator-ui/pages/DashboardPage.tsx` line 4529:

```tsx
onOpenChange={setIsCalendarOpen}
```

## Verification

1. Login → "Today's Occasions" auto-opens in 2-column mode → close it → no Calendar flash.
2. Click calendar icon in header → opens full Calendar normally.
3. Pick an occasion → "Use in prompt" → dialog closes cleanly.
