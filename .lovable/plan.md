# Add Scene & Environment Templates

Add a new optional picker called **Scene & environment** to the Product Ad Scenario dialog, mirroring the existing **Genre & atmosphere** picker. The user can pick one environment preset, and it gets woven into the generated ad scenario (its mood, lighting, location details), while keeping the product the hero.

## Environments to add (~20 presets, 5 groups)

**Industrial & Construction**
- Construction Site — steel building skeletons, giant moving cranes, dust, hard-hat workers at sunset
- Heavy Industry Factory — molten iron, welding sparks, large gear machinery, huge smokestacks
- Abandoned Warehouse — large empty space, broken windows, light beams from the roof, floating dust
- Shipyard / Dock — giant container ships, coastal cranes, seawater, rusty steel structures
- High-Tech Laboratory — clean white walls, blinking server racks, glass chambers, cold blue/laser light

**Urban & Modern**
- Megacity Corporate — giant glass skyscrapers, cloud reflections, sleek business atmosphere
- Cyberpunk Alleyway — narrow crowded night streets, multilingual neon signs, hanging wires, street-food kiosks
- Subway / Underground Station — dark tunnels, fast trains with motion blur, concrete platforms, fluorescent light
- Rooftop Overlook — high-rise rooftop edge at night, city lights and cinematic bokeh in the background

**Natural & Epic Landscapes**
- Epic Mountain Range — snowy sharp peaks, thick valley fog, steep cliffs
- Post-Apocalyptic Wasteland — endless sand plains, abandoned worn vehicles, dusty sky, scorching sun
- Deep Mystical Forest — ancient tall trees, dense foliage, light filtering through leaves, misty atmosphere
- Arctic Tundra / Ice Landscape — endless white plains, ice caves with blue light reflections, snowstorm

**Historical & Fantasy**
- Medieval Castle / Citadel — large stone walls, lit wall torches, dark halls with long wooden tables
- Ancient Ruins — cracked Greek/Egyptian stone columns covered in vines, in a desert or forest
- Gothic Cathedral — pointed architecture, large stained-glass windows casting colored light into a dark hall
- Steampunk Workshop — copper pipes, gauge dials, steam, intricate 19th-century mechanical tools

**Interior & Moody**
- Dimly Lit Jazz Club — cozy space, smoke in spot lighting, shiny brass instruments, dark leather furniture
- Dark Academia Library — tall wooden shelves of old leather books, green desk lamps, scent of old paper
- Retro Diner — red leather booths, neon interior decor, jukebox, rain-streaked windows at night

## Frontend changes (`src/modules/generator-ui/components/ProductAdDialog.tsx`)
1. Add a `SceneTemplate` type and a `SCENE_TEMPLATES` array with `{ id, label, group, prompt }` for the 20 presets above (English directing notes in `prompt`).
2. Add `scene` state (`useState<string>('')`, empty = none).
3. Render a new **"Scene & environment (optional)"** chip group below Genre & atmosphere, styled identically (amber active, white inactive, toggle to deselect). Optionally show small group sub-labels for readability.
4. In `generate()`, pass `scene: SCENE_TEMPLATES.find((s) => s.id === scene)?.prompt || undefined` to the `scenario-write` invoke body.
5. Clear `scene` in `reset()`.

## Backend changes (`supabase/functions/scenario-write/index.ts`)
1. Add optional `scene?: string` (max ~300 chars) to `ProductAdOpts`, read/clip from `body?.scene`.
2. In the camera/genre guidance block, add a line: "Set the entire scenario in this environment/location: ${opts.scene}. Use its setting, lighting, textures, and atmosphere consistently across every shot while keeping the product the clear hero of the advertisement."
3. Backward compatible — ignored when absent. Redeploy the function.

## Technical notes
- Pattern is identical to the existing `GENRE_TEMPLATES` + `genre` implementation, so no new dependencies.
- Single-select, optional; combines freely with duration, camera style, and genre.