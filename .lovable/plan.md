Refactor the DURATION section in `VoiceoverDialog.tsx` to make manual time entry always visible and directly accessible.

Current state
- A `Select` dropdown lists Auto, 5s, 10s, 15s, 30s, 45s, and Custom…
- The custom seconds input only appears after choosing “Custom…”
- The second column is empty or shows a static description for other options

Target state
- Two-column layout stays, but the left column becomes a mode toggle (Auto / Manual)
- The right column always shows a numeric input for seconds (1–135)
- When Auto is active the input is disabled/grayed out and shows a placeholder
- When the user types into the input, the mode automatically switches from Auto to Manual
- When the user switches back to Auto the input is cleared and disabled again

Implementation steps
1. Replace `durationMode: string` and the `Select` with a boolean state `isAutoDuration` (default `true`) and a toggle UI (segmented control or simple toggle/switch) in the left column.
2. Keep `customDuration` but make the numeric `Input` always rendered in the right column.
3. Update the `onChange` of the numeric input so it sets `isAutoDuration = false` and stores the value.
4. Update `resolveDurationSec()` to return `undefined` when `isAutoDuration === true`, otherwise read `customDuration`.
5. Style: input disabled state uses `disabled:opacity-50`/`disabled:cursor-not-allowed`, label stays consistent with existing dark theme labels (`text-xs uppercase tracking-wider text-zinc-400`).
6. Remove obsolete preset values (5, 10, 15, 30, 45) from state/logic — they are no longer in the UI.