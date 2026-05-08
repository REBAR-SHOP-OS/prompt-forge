## Goal

Make the **Start Over** button stop deleting the user's library/history videos (the cards in the "Recent outputs / History" panel). Start Over should reset the *workspace* (composer, selections, merged final film, soundtrack, uploads) but leave the rendered video cards intact — both on screen and on the server.

## Scope

Single file: `src/modules/generator-ui/pages/DashboardPage.tsx`, function `handleStartOver` (around lines 1856–1938). No backend changes.

## Changes to `handleStartOver`

Keep doing:
- Clear merged Final Film (`setMergedEntries([])` + `persistMerged([])`) and remove the merged storage objects (those are derived artifacts, not library cards).
- Clear approved selection set + persisted approvedStorageKey.
- Clear transitions, manual ordering, pending start/end appends (+ their localStorage keys).
- Tear down soundtrack (revoke URL, reset music state, close dialog).
- Reset merge progress flags.
- Reset composer: prompt text, uploaded files, composer error, video column message, upload target, generation mode, duration, preview id.
- Release `lockedProjectRatio` (+ persist null).

Stop doing:
- Do **not** call `setGeneratedVideos([])` — keep the History list as-is.
- Do **not** call `setUserImages([])` — keep uploaded reference images.
- Remove the loop `for (const v of videosToDelete) tasks.push(jobOrchestratorGateway.deleteJob(v.id))`.
- Remove the loop `for (const i of imagesToDelete) tasks.push(generatorUiGateway.deleteUserImage(i.id))`.
- Drop the now-unused `videosToDelete` / `imagesToDelete` snapshot variables.

The merged-videos storage cleanup loop stays (Final Film is a workspace artifact, not a library card).

## Result

Clicking **Start Over** returns the editor to a blank prompting state and removes the Final Film, but every previously generated clip remains in the History panel and on the server, ready to be reused.
