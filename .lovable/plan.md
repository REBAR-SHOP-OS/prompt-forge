## Goal
Greatly expand the "Construction & Civil Works" scene category with many more building/construction-focused styles (target ~35–40 total), so the Scene & Environment section is dominated by construction environments.

## Where it lives
`SCENE_STYLES` in `src/modules/generator-ui/lib/promptStyles.ts`. The `G_CONSTRUCTION` group already exists with 16 items. UI auto-renders one heading per group in list order (construction group already renders first).

## Changes (single file: `promptStyles.ts`)
Add ~22 more construction/building items to the `G_CONSTRUCTION` block, each with a distinct icon and an English directing `prompt`. Proposed additions (on top of the existing 16):

- Site Groundbreaking / Survey 📐
- Deep Foundation Piling 🪛
- Formwork & Shuttering 🪜
- Precast Concrete Yard 🧊
- Masonry & Bricklaying 🧱
- Structural Welding Close-up 🔥
- Glass Curtain Wall Install 🪟
- Roofing & Waterproofing 🏠
- MEP / Pipes & Ducts Install 🔧
- Electrical Wiring & Conduit ⚡
- Interior Fit-Out / Drywall 🚪
- Plastering & Finishing 🎨
- Elevator / Lift Shaft Work 🛗
- Metro / Railway Construction 🚆
- Airport / Runway Construction 🛬
- Port & Marine Works ⚓
- Canal / Water Infrastructure 💧
- Pipeline Laying 🧯
- Power Plant Construction 🏭
- Warehouse / Logistics Build 🏬
- Stadium / Arena Construction 🏟️
- Nighttime Construction Site 🌙

Existing "Industrial & Construction" group (Construction Site, Heavy Industry, etc.) stays unchanged.

## Notes
- New items have no preview clip (no matching videos) — they render as normal chips without hover preview, consistent with current behavior. No `STYLE_PREVIEWS` changes.

## Validation
- `tsgo --noEmit` clean.
- Product Ad Scenario → Scene & Environment shows a large "Construction & Civil Works" group first with all chips selectable and injecting their prompt fragment.