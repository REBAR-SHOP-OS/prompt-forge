## Continuity Mode — implementation plan

### Goal
Let users optionally make each new card continue from the previous clip using three combined signals: (1) the previous clip's final frame, (2) a saved character/reference image, and (3) an editable short scene memory — plus an auto-appended continuity instruction in the generation prompt. Continuity stays fully optional and existing behavior is untouched when off.

### What already exists (reuse, don't rebuild)
- `handleAddVideoCard` already seeds the previous completed clip's **final frame** as the Start frame (`captureLastFrameAsBlob` → upload → Start upload).
- Character reference already exists: `selectedCharacter`, `resolveCharacterDescription`, `applyCharacterPrefix` inject the character description into the prompt.
- `draftGroupId` (`ensureActiveDraftGroupId`) already identifies the current project/generation chain.
- Frame fields (`firstFrameUrl`/`lastFrameUrl`) already flow into `createJob` and persist on the job row.

Continuity Mode wires these together behind one toggle and adds the missing pieces: scene memory + the continuity prompt block.

### Smallest safe data approach (no schema change)
Store continuity state in `localStorage`, keyed by the active `draftGroupId`, exactly like the existing `persistLockedRatio` / `persistPendingEndAppends` patterns. This satisfies "store and reuse a short scene memory per project/generation chain" without touching the backend, DB, or provider architecture.

Stored shape per chain:
```text
continuity:<draftGroupId> = {
  enabled: boolean,
  source: "previous-final-frame" | "best-clear-frame",
  memory: { character, environment, style, lastState }
}
```
"Which continuation inputs were used" is already captured on the job via `first_frame_url`/`last_frame_url`, and the continuity text is embedded in the saved prompt — so it is debuggable/repeatable without new columns.

### UI changes (DashboardPage.tsx, near duration/cards controls)
1. **Toggle**: a compact "Continuity Mode" `Switch` placed beside the duration controls.
   - Disabled state with tooltip when no previous completed clip exists in the project.
2. **Continuity panel** (shown when enabled): 
   - Continuation source row: "Previous final frame" (default) with a secondary "Best clear frame" option only if a clearer frame is available (uses existing thumbnail/last-frame data; no new AI frame-quality system).
   - Character/reference row: "No reference selected" + subtle warning "Add a character reference for stronger continuity." when none, or the selected character name/thumbnail when set (reuses `selectedCharacter`).
   - Scene memory preview: character / environment / visual style / previous ending state.
   - **Edit memory** action opening a small dialog (existing `Dialog` + `Textarea`) to manually adjust memory before generating.
3. If scene memory is empty when enabling, auto-generate a starter memory from the current prompt + card metadata (lightweight local heuristic, user-editable).

### Prompt behavior
When Continuity Mode is enabled, build the final prompt as: character prefix (existing) → user prompt → appended continuity block:
```text
Continue directly from the previous clip. Preserve the same main character, outfit, proportions, colors, visual style, lighting, environment, camera language, and story context. Use the provided previous frame as the motion and position bridge. Use the character/reference image to preserve identity and fine details. Do not redesign the character, location, or visual style unless the user explicitly asks for a change.

Scene memory:
Main character: <character>
Environment: <environment>
Visual style: <style>
Previous ending state: <lastState>
```
This is added in the existing `handleSubmit` path right where `applyCharacterPrefix` runs, gated on the toggle.

### Generation job behavior
- Continuity ON + previous clip exists → ensure the previous final/selected frame is passed as `firstFrameUrl` (reuse `handleAddVideoCard`'s seeding so the Start frame is already populated), keep existing start-image behavior.
- Character/reference: current provider flow injects it as prompt text (multi-image reference not supported yet), so we keep the character description in the prompt — matching the spec's fallback.
- Continuity prompt block + scene memory included in the final provider prompt.
- After a card completes, update the chain's `lastState` memory from the new prompt so the next card reuses it.

### Failure states
- No previous clip → toggle disabled with clear reason.
- No character reference → still allowed; subtle warning shown.
- Empty scene memory → starter memory generated from prompt/metadata and made editable.

### Explicitly out of scope (untouched)
No new project, no stack change, no generation-pipeline redesign, no billing/credits/team/model-comparison, existing final-frame continuation preserved, Continuity Mode optional and off by default.

### Validation
- Toggle enable/disable; disabled state with no prior clip.
- Card 2 from card 1 uses previous frame as continuation image.
- Character asset, when present, is referenced in the job prompt.
- Final prompt contains the continuity instruction block + scene memory.
- Scene memory persists per chain and is reused; user can edit before generating.
- Normal generation still works with Continuity off.
- Typecheck/build passes.

### Technical notes
- All changes are frontend/presentation in `src/modules/generator-ui/pages/DashboardPage.tsx` plus possibly one small helper file (e.g. `lib/continuity.ts`) for the localStorage read/write and memory templating.
- No edits to `createJob` contract, edge functions, DB schema, or provider adapters.
