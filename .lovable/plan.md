## Add text labels to three icon-only gradient buttons

### What
The user circled three small circular gradient buttons at the bottom of the prompt bar that currently show only icons:
1. **Reframe** (teal/cyan gradient, Crop icon)
2. **Generate image with AI** (purple/fuchsia gradient, Sparkles icon)
3. **Write scenario** (orange/amber gradient, Scenario/Story icon)

These need visible text labels so users understand their purpose.

### How
In `src/modules/generator-ui/pages/DashboardPage.tsx`:

1. **Reframe button** (~line 11927): Change from `h-8 w-8` to a wider pill shape (e.g., `h-8 px-3` or `h-9 px-3`). Add text span "Reframe" next to the Crop icon. Keep the gradient background, rounded-full shape, shadow, and hover states.

2. **AI Image button** (~line 11936): Same treatment. Change to pill shape and add text span "AI Image" (or "Image") next to the Sparkles icon. Preserve gradient, shadow, and hover states.

3. **Scenario button** (~line 11946): Same treatment. Add text span "Scenario" next to its icon. Preserve gradient, shadow, and hover states.

### Styling considerations
- Use `inline-flex items-center gap-1.5` for icon+text alignment.
- Keep `rounded-full` (pill shape) instead of small circle.
- Maintain existing `aria-label` and `title` attributes for accessibility.
- Text should use the same color as the active state (white for purple/teal, `text-zinc-950` for orange).
- Ensure the prompt bar layout still fits without wrapping on typical desktop widths; use responsive gap/spacing if needed.

### Files changed
- `src/modules/generator-ui/pages/DashboardPage.tsx` only.

No backend, auth, storage, or dependency changes.