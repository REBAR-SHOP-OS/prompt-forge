# Plan: Project character recognized by every card

## Goal
When a character is added to a project (via Character Sheet or the "Add character" picker), the system must treat that character as the project's identity anchor and attach it to **every** generated card — the first card, single-card generations, and all continuation/chained cards — so the character never drifts or changes while the film continues.

## Current behavior (what's wrong)
The plumbing for sending a character reference image to the provider already exists end-to-end (`referenceImageUrls` → job-orchestrator gateway → external-api-adapter, max 3 images). But the frontend only uses it partially:

1. **Single-card generations don't send the character image.** In `handleSubmit`, the four single-card `createJob` calls (text-to-video, start+end, start-only, end-only) never pass `referenceImageUrls`. Only the multi-scene `submitScenesAsJobs` path attaches the character image. So a normal "continue the film" / single card render relies only on a text description that can drift.
2. **The character is lost on project reopen.** `selectedCharacter` is component state only. `continuity.characterRef` is persisted per project chain, but when a project is reopened `selectedCharacter` is not re-hydrated from it, so later cards generate without the anchor.
3. **The single path only reads `selectedCharacter`,** not falling back to the persisted `continuity.characterRef`, so even mid-session the anchor can be missing.

## Changes (frontend only — `DashboardPage.tsx`)

### 1. Single, project-wide character resolver
Add a derived value used everywhere a job is created:
```text
projectCharacter = selectedCharacter ?? continuity.characterRef ?? null
projectCharacterRefs = projectCharacter?.url ? [projectCharacter.url] : undefined
```

### 2. Attach the character image to every single-card job
In `handleSubmit`, pass `referenceImageUrls: projectCharacterRefs` to all four single-card `createJob` calls (text-to-video, start+end, start-only, end-only). Also resolve and prepend the character text description using `projectCharacter` (not just `selectedCharacter`) so both the image anchor and the descriptive prefix are always present.

### 3. Keep chained cards using the same anchor
`submitScenesAsJobs` already builds `continuityCharacterRef = selectedCharacter ?? continuity.characterRef`. Switch it to use the shared `projectCharacter` and ensure the reference image is sent on every card (it already is). Remove the `continuityActive` gate on the character image so card 1 of a chain also carries the anchor whenever a project character exists.

### 4. Restore the character when a project is reopened
When the active chain changes (the effect at the `continuityChainKey` change that calls `loadContinuity`), also re-hydrate `selectedCharacter` from the loaded `continuity.characterRef`. This makes the anchor survive project switches and reloads.

### 5. Persist on selection (already mostly done)
Both selection points (`CharacterSheetDialog onUseCharacter` and the in-project picker) already call `updateContinuity({ characterRef })`. Keep that so the anchor is saved per project. Removing the character clears both `selectedCharacter` and `continuity.characterRef`.

## Constraints / safety
- Provider reference-image cap is 3; the project uses exactly one character URL, so we stay within limits.
- No backend, schema, or edge-function changes — all required parameters already exist and are validated server-side.
- `Start Over` continues to reset `selectedCharacter` and continuity, so a fresh project starts with no anchor.
- Purely additive to generation requests; existing prompt, frame-seeding, and continuity logic are unchanged.

## Verification
- Add a character, generate a single card → confirm the create-job request carries `referenceImageUrls`.
- Generate a multi-scene / long-duration film → every card carries the same reference image.
- Reopen the project → the character chip is restored and the next card still carries the anchor.
- `bun run tsc --noEmit` clean.
