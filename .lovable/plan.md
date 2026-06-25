## Plan: Default Provider Always WAN

### Problem
The model selector currently reads `ui:preferred-model` from `localStorage` on init, so if the user previously picked a Flow/Veo model it stays selected on reload. The user wants WAN to **always** be the default.

### Files to change
- `src/modules/generator-ui/pages/DashboardPage.tsx`

### Changes
1. **Initializer (line 3430-3433):** Change `selectedModelId` initial state from `localStorage.getItem('ui:preferred-model') ?? 'wan-i2v'` to simply `'wan-i2v'`. This guarantees WAN is selected on every fresh mount.
2. **Persistence (line 3458):** Remove the `useEffect` that writes `ui:preferred-model` back to `localStorage` so the choice is never persisted and WAN remains the default on return.

No backend or auth changes. No UI layout changes. Typecheck after edit.