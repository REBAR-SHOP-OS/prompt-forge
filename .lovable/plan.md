## Goal
Make every option chip in the prompt builder (ProductAdDialog) visual: add a colorful emoji/icon in front of each label across **Camera Style**, **Genre & Atmosphere**, and **Scene & Environment**, so users recognize options at a glance.

## Approach
Use colorful emojis (native, already colored) as the visual marker — the cleanest way to add meaning to many small chips without custom SVG assets. Each chip shows `emoji + label`.

## Changes — `src/modules/generator-ui/components/ProductAdDialog.tsx`

1. **Camera Style**: convert `CAMERA_STYLES` from a `string[]` into `{ label, icon }[]` (or add a lookup map) and pick a fitting emoji for each:
   - Whip Pan 💫, Orbit Shot 🛰️, FPV Drone 🚁, Tracking Shot 🎯, Push In Cinematic 🎬, Fly Through 🕊️, Crash Zoom 💥, Handheld Dynamic 🤳, Dolly Zoom 🌀, Parallax Motion 🧊.
   - Update the render loop to show the icon before the label and keep `cameraStyle` state value as the existing label string (so downstream logic is unchanged).

2. **Genre & Atmosphere**: add an `icon` field to each `GENRE_TEMPLATES` entry:
   - Epic Fantasy 🐉, Sci-Fi Minimalist 🛸, Post-Apocalyptic ☢️, Horror Jump-Scare 👻, High-Octane Action 🔥, Romantic Dreamscape 💗, Documentary / Realism 🎥, Anime / Manga Style 🌸.
   - Render `g.icon` before `g.label`.

3. **Scene & Environment**: add an `icon` field to each `SCENE_TEMPLATES` entry:
   - Construction Site 🏗️, Heavy Industry Factory 🏭, Abandoned Warehouse 🕸️, Shipyard / Dock 🚢, High-Tech Laboratory 🔬, Megacity Corporate 🏙️, Cyberpunk Alleyway 🌃, Subway / Underground Station 🚇, Rooftop Overlook 🌆, Epic Mountain Range 🏔️, Post-Apocalyptic Wasteland 🏜️, Deep Mystical Forest 🌲, Arctic Tundra / Ice Landscape ❄️, Medieval Castle / Citadel 🏰, Ancient Ruins 🏛️, Gothic Cathedral ⛪, Steampunk Workshop ⚙️, Dimly Lit Jazz Club 🎷, Dark Academia Library 📚, Retro Diner 🍔.
   - Render `s.icon` before `s.label`.

4. In all three chip buttons, place the emoji in a small `<span>` with a little right margin so spacing stays clean; keep the existing rounded-chip styling, active/amber states, and selection logic exactly as-is.

## Result
All chips in this prompt UI become colorful and icon-led, making the choices instantly scannable, with no change to selection behavior or the generated prompt payloads.
