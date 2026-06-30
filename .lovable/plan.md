## Problem

When a video is playing in the **Preview** panel, it stutters/lags — but only while a job is active (note the “PENDING 1” job in the screenshot).

## Root cause

In `src/modules/generator-ui/pages/DashboardPage.tsx` (lines ~5936–5948) there is a page-wide "smooth progress ticker":

```ts
const [, setProgressTick] = useState(0)
useEffect(() => {
  if (isReadOnlyProject) return
  const hasActive = generatedVideos.some((job) => !isTerminalStatus(job.status))
  if (!hasActive) return
  const id = window.setInterval(() => setProgressTick((tick) => tick + 1), 1000)
  return () => window.clearInterval(id)
}, [generatedVideos, isReadOnlyProject])
```

While any job is pending/processing, this calls `setState` **once per second**, which re-renders the entire 13k-line `DashboardPage` component — including the Preview player subtree (`VideoWithSoundtrack` / `SequentialClipPlayer`) and its `<video>`. That once-per-second forced re-render of the heavy tree is exactly the periodic hitch the user sees during playback. As soon as the job finishes, the ticker stops and playback is smooth — confirming the diagnosis.

This is the same class of bug already solved elsewhere in the file (the `SequentialClipPlayer` playhead was deliberately decoupled from React render to stop stutter); the page-level progress ticker re-introduced it.

## Fix (root cause, scoped to progress UI only)

Decouple the per-second progress animation from the whole-page render so only the tiny progress widgets re-render — never the preview player.

1. **Remove the page-wide ticker** (`setProgressTick` state + its `useEffect`) at lines ~5936–5948.

2. **Add a small isolated `LiveJobProgress` component** (new file `src/modules/generator-ui/components/LiveJobProgress.tsx`) that:
   - owns its own `useState` + 1s `setInterval` (only runs while the job is non-terminal),
   - computes the percent via the existing module-level `getJobProgressPercent`,
   - exposes the value through a render prop (`children: (pct: number | null) => ReactNode`).

   Because each instance holds its own state, only that small widget re-renders each second — the preview `<video>` is untouched.

3. **Use `LiveJobProgress` at the three progress display sites** in `DashboardPage.tsx` that currently relied on the page re-render:
   - the Preview circular progress ring (~line 10544),
   - the pending-card percent label (~line 11276),
   - the pending-card progress bar (~line 11285).

   To keep `getJobProgressPercent` (and its module `progressMaxRef`) as the single source of truth, export it from `DashboardPage.tsx` (or move it into a tiny shared `lib/jobProgress.ts` imported by both) so the new component reuses the exact same calculation.

## Result

- Progress bars/rings still advance smoothly once per second between API polls.
- The Preview video no longer re-renders every second, eliminating the playback lag.
- No change to generation, audio, merge, or any backend logic.

## Verification

- `tsgo` typecheck clean.
- Manually: start/have an active job, open Preview, play a clip — confirm smooth playback while the pending progress still animates.
</content>
<parameter name="summary">Fix preview playback lag caused by a page-wide 1s progress ticker re-rendering the whole DashboardPage; isolate the ticking into a small per-job progress component.