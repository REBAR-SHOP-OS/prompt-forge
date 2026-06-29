# Fix: pinned product persists after "Start Over"

## Problem
When the user clicks **Start Over**, the previously pinned product chip stays in the composer. This is a real bug: the reset routine clears almost every workspace value (prompt, character, music, voiceover, uploads, duration, etc.) but forgets the product.

## Root cause
In `src/modules/generator-ui/pages/DashboardPage.tsx`, `resetWorkspace()` (lines ~8092–8175) resets composer state including `setSelectedCharacter(null)` — but never touches `selectedProduct` or `productMenuOpen`. Since the product lives only in in-memory React state (it is not persisted to storage), simply resetting it in this function fully fixes the issue. `handleStartOver()` calls `resetWorkspace()`, so the fix applies to both the Start Over button and the fresh-login auto-reset path.

## Change (single, minimal, safe)
In `resetWorkspace()`, alongside the existing composer resets (right after `setSelectedCharacter(null)`), add:

```ts
setSelectedProduct(null)
setProductMenuOpen(false)
```

## Why this is safe
- Product state is in-memory only (no DB/storage writes), so clearing it has no side effects on saved Library projects or storage files.
- It mirrors the existing `setSelectedCharacter(null)` handling, keeping reset behavior consistent.
- No change to generation logic, identity anchors, or persisted drafts. Reopening a saved/draft project still restores its own product because that path sets `selectedProduct` explicitly.

## Verification
- Pin a product, click **Start Over** → the product chip disappears and the composer shows the empty "Start forging a prompt" state.
- Confirm character, prompt, music, and voiceover still clear as before.
- Typecheck remains clean.
