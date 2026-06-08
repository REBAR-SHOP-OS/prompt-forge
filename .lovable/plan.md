## Goal

Move the **Product Ad** icon (currently the cube/package icon in the small top toolbar row) down into the main action row, placing it next to the **Prompt** button, and restyle it as a large, colorful, lively, prominent icon — since it launches an important prompt UI.

## Current state

- The Product Ad button lives in the top toolbar row (`DashboardPage.tsx`, ~line 7650) alongside Crop, AI image (Sparkles), and Scenario (Clapperboard) buttons. It's a small, muted `h-8 w-8` circular icon-only button using the `Package` icon and `onClick={() => setIsProductAdOpen(true)}`.
- The main action row (~lines 7759-7928) contains: cost chip, model selector, the **Prompt** enhance button, and the submit/arrow button.

## Changes

1. **Remove** the Product Ad button block from the top toolbar row (lines ~7650-7658).

2. **Add** a new, prominent Product Ad button into the main action row, placed immediately to the left of the **Prompt** button (before the Prompt `Popover` at ~line 7815). It will:
   - Keep the same behavior: `onClick={() => setIsProductAdOpen(true)}`.
   - Be visually large and colorful/lively: a filled gradient (amber/brand accent) pill button at `h-11`, with the `Package` icon at a larger size plus a short label (e.g. "Product Ad"), so it reads as an important call-to-action rather than a muted icon.
   - Match Persian behavior already used elsewhere (label switches with `lang` if applicable in this area).

3. No backend, logic, or dialog changes — only the location and styling of the trigger button.

## Technical notes

- Single file: `src/modules/generator-ui/pages/DashboardPage.tsx`.
- Reuse existing semantic/brand color classes (amber accent + gradient) consistent with the design system already used in this composer.
