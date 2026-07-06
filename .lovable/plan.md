## Goal
Make the prompt textarea span the full width of the composer/chat box and enlarge the chat box itself so long prompts are readable instead of cramped in a narrow side column.

## What will change

1. **Composer width**
   - Increase `sm:w-[min(96rem,calc(100vw-56rem))]` to use more horizontal space on large screens so the chat box feels larger.

2. **Textarea layout**
   - Remove the `sm:grid-cols-[minmax(0,1fr)_auto]` two-column layout that squeezes the textarea next to the action buttons.
   - Stack the textarea above the action buttons so it can use the full composer width.
   - Keep the textarea’s existing `w-full`, `whitespace-pre-wrap`, and `break-words` behavior.

3. **Textarea height**
   - Increase `min-h-16` to a taller minimum (e.g., `min-h-20` or `min-h-24`) so the chat box itself feels larger and multi-line prompts are comfortable.
   - Keep `max-h-40` and `overflow-y-auto` so very long prompts still scroll.

## Files
- `src/modules/generator-ui/pages/DashboardPage.tsx` — composer form width class, grid layout, and textarea sizing classes.

## Validation
- Type-check passes (`bun run tsc --noEmit`).
- Visual check in preview confirms textarea spans full width and composer is wider.