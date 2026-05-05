## Goal

Bring the dashboard UI back to the minimal Apple-style "stage" layout shown in the reference screenshot. All of the existing logic (uploads, prompt submission, jobs, ordered cards, `+` continuation, history merging) is preserved — only the **visual shell and layout** of `DashboardPage.tsx` is rebuilt.

## Target layout (matches screenshot)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [▦]                       ⟲ START OVER                       [HISTORY  N] [▦]│
│                                                              ────────────────│
│                                                              Video renders   │
│                                                              Recent outputs +│
│                                                              ┌──────────────┐│
│                                                              │ #1  ▶ video  ││
│                                                              │     prompt   ││
│                                                              │ ● Ready  date││
│                                                              └──────────────┘│
│                                                              ┌──────────────┐│
│                                                              │ #2  ...      ││
│                                                              └──────────────┘│
│                                                                              │
│                  ┌────────────────────────────────────┐                      │
│                  │                                    │                      │
│                  │       ▶  (preview <video>)         │                      │
│                  │                                    │                      │
│                  └────────────────────────────────────┘                      │
│                  Attached files: - Start: ...      ● Ready                   │
│                                                                              │
│                                                                              │
│                  ┌──────────────────────────────────────────┐                │
│                  │ [Text to Video] [Image to Video]  [5s][10s]              │
│                  │ [Start ⤴] » [End ⤴]                                       │
│                  │ What do you want to forge?            ( → )              │
│                  └──────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────────────────┘
```

Everything else currently on the dashboard (left "Creator workspace" sidebar, big "Video Workspace" frame card with Start/End drop zones, "Preview / Latest selected render" header card, "Render history" grid section with per-card approve/delete/merge bars, credits chip, sign-out row, "Edit & reuse", "Clear inputs" bar) is removed from the main canvas. The render history collapses into the right HISTORY panel only.

## Scope

Single file: `src/modules/generator-ui/pages/DashboardPage.tsx`. No backend, no contract, no routing changes. All hooks, state, handlers, network calls, ordering logic, `+` continuation behavior, and numbered card badges keep working — only the JSX shell and Tailwind classes change.

## Sections to build

1. **Page chrome (full-bleed black background)**
   - Outer wrapper: `min-h-screen bg-black text-white relative overflow-hidden`.
   - Subtle dotted grid background (already used in the screenshot's faint grid) via a CSS background.

2. **Top bar (fixed-feeling, transparent)**
   - Left: small grid icon button (LayoutGrid) — opens a future panel; for now, no-op.
   - Center: `START OVER` pill with `RotateCcw` icon → calls existing `resetComposer()` (and clears active preview).
   - Right: `HISTORY` chip with badge count + a small grid-toggle icon — these are visual only (the panel is always visible on desktop).

3. **Right HISTORY panel (sidebar)**
   - Width ~320px on `xl:`, collapses behind a button on smaller screens.
   - Header: `HISTORY  [N]` and a top-right grid icon.
   - Sub-header: `Video renders` (label), `Recent outputs` row with a `+` icon (the existing "continue from previous card" / new card action).
   - List of cards rendered from existing `visibleVideos`, **ordered ascending (#1 at top, then #2, #3 …)** matching the previous request.
   - Each card:
     - `#N` badge (top-left).
     - Inline `<video>` thumbnail (autoplay muted, `playsInline`, native controls hidden via `controls={false}` to mimic screenshot, or shown like screenshot does — keep native to match the reference).
     - One-line prompt (truncate) + "Attached files" line.
     - Footer: `● Ready` status dot + relative timestamp.
     - Small action icons (open, edit, delete) on the right of the prompt row, matching the three glyphs in the screenshot.
   - Click a card → sets it as the central preview.

4. **Center stage**
   - Large centered `<video>` element when `previewVideo?.video?.storage_path` exists, otherwise an empty black panel with the same aspect (no decorative empty-state copy — the screenshot has a bare frame).
   - Single line below the video: `Attached files: - Start: <name>  <prompt>` and a `● Ready` chip on the right (mirrors the screenshot's caption row).

5. **Floating bottom composer**
   - Centered, max-width ~640px, rounded-[28px], `bg-zinc-900/80 backdrop-blur`, soft border.
   - Row 1: pill toggle `Text to Video | Image to Video` (left) and `5s | 10s` toggle (right) — wired to existing `generationMode` and `durationSeconds` state.
   - Row 2: `Start ⤴` and `End ⤴` upload chips with a `»` separator, calling existing `triggerFilePicker('Start' | 'End')`. Show small filename pill once attached.
   - Row 3: prompt textarea (`What do you want to forge?` placeholder) + circular `→` submit button on the right that calls existing `handleSubmit`.
   - Disabled / loading states identical to today.

6. **Removed from the main page** (logic kept but no UI surface — existing handlers stay intact for future re-use):
   - "Creator workspace" left sidebar (profile, credits chip, Start/End/Generation tiles, Library, Sign out).
   - "Video Workspace" big card with dual drag-zones and right-side mode/duration form (replaced by the floating composer).
   - "Preview" header card and the actions row (Approve, Delete, Prepend/Append, model/date chips).
   - "Render history" section (heading, Merge button, grid of cards) — merged into the right HISTORY panel.
   - Merging progress bar (kept logic; surfaced as a small chip near the top bar when `isMerging`).
   - Sign-out button → moved to a small icon button next to the top-left grid icon, or omitted from the canvas (still callable from a hidden user menu — confirm with user if needed; default: keep a tiny icon-only button top-left to preserve access).

## Functional rules preserved

- **Card numbering**: cards are rendered top-down `#1, #2, #3, …` in the right panel (insertion order).
- **`+` button**: in the HISTORY panel header next to "Recent outputs", pressing `+` starts a new card whose prompt context continues from the most recent (last) card — same behavior implemented previously.
- **Type-safe progress callbacks**: keep the already-fixed `(p) => setMergeProgress(Math.round(p.ratio * 100))` calls untouched.

## Out of scope

- No new backend endpoints, no schema changes, no auth changes.
- No styling tokens added; reuse existing Tailwind classes and lucide icons already imported.
- Translations/RTL layout unchanged (the existing prompts in Persian render fine inside the new composer).

## Verification

After the rewrite:
- The page visually matches the screenshot: dark canvas, top "START OVER" pill, right HISTORY panel with one numbered card, center video, bottom floating composer.
- Submitting from the bottom composer creates a job (jobs-create POST returns 200) and a new numbered card appears in the right panel.
- Clicking `+` adds a new render card whose prompt continues the previous card.
- Build passes (no TypeScript errors); no console errors on load.
