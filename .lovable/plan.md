## Goal
Add a dedicated "Construction" scene category with many construction-focused styles, so it appears as its own group in the Scene & Environment section (Product Ad Scenario dialog + the composer's Styles picker).

## Where it lives
All scene styles come from `SCENE_STYLES` in `src/modules/generator-ui/lib/promptStyles.ts`. Each item has `id`, `label`, `icon`, `group`, `prompt`, and an optional `preview` clip. Groups are just string labels (e.g. `Industrial & Construction`, `Urban & Modern`) — the UI renders one sub-heading per distinct `group` automatically, in list order. Items without a preview clip simply show no hover preview (fully supported).

## Changes (single file: `promptStyles.ts`)

1. Add a new group constant:
   ```ts
   const G_CONSTRUCTION = 'Construction & Civil Works'
   ```

2. Insert a block of new construction scene items at the top of `SCENE_STYLES` (so the category renders first). Roughly 14–16 styles, each with a distinct icon and an English directing `prompt` (prompts stay English since they feed the enhance-prompt function). Proposed styles:
   - High-Rise Tower Construction 🏗️
   - Skyscraper Steel Framework 🏙️
   - Concrete Pour / Casting 🧱
   - Rebar & Reinforcement Site 🔩
   - Tower Crane Operation 🏗️
   - Highway / Bridge Construction 🌉
   - Road Paving & Asphalt 🛣️
   - Tunnel Boring / Excavation 🚧
   - Foundation & Earthworks 🪏
   - Scaffolding & Facade Work 🧗
   - Residential Housing Build 🏘️
   - Prefab / Modular Assembly 📦
   - Demolition Site 💣
   - Dam / Hydro Construction 🌊
   - Oil & Gas / Refinery Build 🛢️
   - Solar / Wind Farm Construction ☀️

   The existing "Construction Site", "Heavy Industry Factory", "Shipyard / Dock", etc. under `Industrial & Construction` remain unchanged.

3. No changes to `STYLE_PREVIEWS` — the new items have no video clips yet, so they'll render without hover previews (consistent with existing behavior). The attach loop already handles missing previews gracefully.

## Notes / trade-offs
- The new items get no looping preview video (we have no matching clips). Everything else (selection, prompt injection, category heading) works immediately.
- If you later want preview clips for these, we can generate/attach them in a follow-up.

## Validation
- `bun run tsc --noEmit` clean.
- Open the Product Ad Scenario dialog → Scene & Environment shows the new "Construction & Civil Works" heading with all the new chips; selecting them adds their prompt fragment to the generated scenario.