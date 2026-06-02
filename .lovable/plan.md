## Problem

The "Send all to Pending" button does nothing for 30s (and 135s). In both `ScenarioWriterDialog.tsx` and `ProductAdDialog.tsx`, `handleSendAll()` starts with:

```ts
if (scenes.length !== 3 || !onSendScenes || isSending) return
```

This hard-codes 3 scenes, so 30s (2 scenes) and 135s (9 scenes) bail out immediately even though the cards render and `onSendScenes` can handle any count.

## Fix

In both files, change the guard to accept any multi-scene result:

```ts
if (scenes.length < 2 || !onSendScenes || isSending) return
```

No other changes needed — `isSplit` already shows the button for 30/45/135, and `DashboardPage.onSendScenes` already chains an arbitrary number of scenes.

## Files

- `src/modules/generator-ui/components/ScenarioWriterDialog.tsx`
- `src/modules/generator-ui/components/ProductAdDialog.tsx`
