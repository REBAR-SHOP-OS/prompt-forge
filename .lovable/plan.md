## Goal

When a project is a finalized **Final Film** (read-only), the editing action icons in the "Working clips / Pending" header must never be shown — because a finalized film can no longer be edited.

## What the icons are

In `src/modules/generator-ui/pages/DashboardPage.tsx`, the header row (around lines 7269–7347) contains an action toolbar `<div className="flex items-center gap-2">` with four controls:
- Upload image (`ImagePlus`)
- Generate film cover with AI (`Camera`)
- Upload film (`Upload`)
- Live preview all cards (`Play`)

These are the icons circled in the screenshot. They are edit/creation actions that make no sense on a finalized, read-only film.

## The fix

The component already derives `isReadOnlyProject` (line 1554):
`const isReadOnlyProject = !!selectedProjectId && !selectedProjectId.startsWith('draft-')` — true for finalized Final Film projects, false for drafts/active workspace.

Wrap the action toolbar so it only renders when the project is **not** read-only:

```text
{!isReadOnlyProject && (
  <div className="flex items-center gap-2"> ... the 4 buttons ... </div>
)}
```

This guarantees the icons are completely hidden (not just disabled) for any finalized film, while leaving them fully available for drafts and the active workspace. The existing "This final video is read-only" banner (line 8498) already communicates the read-only state.

## Scope

- Single frontend edit in `DashboardPage.tsx` (wrap the toolbar div conditionally).
- No backend, data, or business-logic changes.
- The Live preview action stays available implicitly through the read-only preview path already present elsewhere; only the header edit toolbar is hidden.
</content>
<summary>Hide the edit action icons in the project header whenever a finalized Final Film (read-only) project is shown.</summary>
</invoke>
