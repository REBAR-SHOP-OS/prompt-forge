# Make Final videos view-only

## Goal
When a user opens an entry from the **Final videos** section of the Library, it should open in a **read-only viewer**: they can watch/preview it, **download** it, and **delete** it from the library — but they can no longer modify the project in any way (no resuming it into the workspace, no adding/uploading clips, no trimming/reframing/voiceover/music edits, no re-running Final Film, no reordering or deleting individual source clips).

Drafts are unaffected — they remain fully editable/resumable as today.

## Concept
The app already distinguishes the two cases by id:
- Finalized project selected → `selectedProjectId` is set and does **not** start with `draft-`.
- Draft selected → `selectedProjectId` starts with `draft-`.

We introduce one derived flag:

```text
isReadOnlyProject = !!selectedProjectId && !selectedProjectId.startsWith('draft-')
```

This flag becomes the single source of truth for "the open project is a finished Final video, so block all mutations."

## Changes (single file: `src/modules/generator-ui/pages/DashboardPage.tsx`)

### 1. Define the flag
Add the `isReadOnlyProject` derived boolean near where `selectedProjectId` and related view state are computed, so it can be referenced by both handlers and JSX.

### 2. Hard-stop the editing entry point
`resumeSelectedProject()` is what converts a viewed finalized project back into an editable live workspace. Every edit action funnels through it (submit prompt, upload image, upload video, etc.). Make it **early-return without doing anything when `isReadOnlyProject` is true**. This is the principled backstop: even if a control is missed in the UI, no finalized project can be mutated.

### 3. Disable/hide editing controls while a Final video is open
When `isReadOnlyProject` is true, hide or disable these surfaces (keep them exactly as-is for drafts and normal workspace):

- **Composer** (bottom prompt bar): disable the prompt textarea, the submit/forge button, model/duration/ratio controls, and the image/video upload buttons — or replace the composer with a small "This final video is read-only" notice.
- **Top toolbar**: hide/disable the editing actions that mutate the open project — Final Film (re-render), Music soundtrack, Voiceover. `Start Over` stays available (it just exits/clears the view).
- **Per-clip card actions** in the snapshot/history view: hide Trim, Reframe, Video-to-Video, voiceover, drag-to-reorder handles, and the per-card delete button for the source clips of the finalized project.

### 4. Keep what the user asked to keep
- **Download** button on the Final video library card stays active (already `stopPropagation`'d).
- **Delete** button on the Final video library card stays active (removes the whole final video).
- Playback/preview of the final video and its clips stays fully functional.

## What is intentionally NOT changed
- Drafts remain editable and resumable.
- The normal generation workspace (no project selected) is untouched.
- No backend, schema, RLS, or edge-function changes — this is purely frontend gating.

## Verification
1. Open a **Final video** from the Library → it plays/previews; composer and all edit controls are gone/disabled; Download and Delete still work.
2. Try to add a clip / upload / trim / re-run Final Film → not possible; the project is never pushed back into the editable workspace.
3. Open a **Draft** → still fully editable and resumable (unchanged).
4. `Start Over` from a Final video view → returns to a clean workspace.
5. Refresh while viewing a Final video → still read-only.
