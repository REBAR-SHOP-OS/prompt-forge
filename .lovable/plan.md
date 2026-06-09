## Goal
Make the heart icon on the "Product Ad" button animate like a beating heart — a subtle, looping scale pulse (chashmak/tapesh).

## Changes

### 1. `tailwind.config.ts`
Add a `heartbeat` keyframe and animation to `theme.extend`:
- Keyframes: scale `1 → 1.25 → 1 → 1.18 → 1` across the cycle to mimic a double-thump heartbeat.
- Animation: `heartbeat: "heartbeat 1.3s ease-in-out infinite"`.

### 2. `src/modules/generator-ui/pages/DashboardPage.tsx` (line ~8213)
Add the `animate-heartbeat` class to the `<Heart>` icon so it pulses continuously:
```tsx
<Heart className="h-5 w-5 animate-heartbeat" aria-hidden="true" />
```

## Notes
- Pure CSS/Tailwind animation, no JS or logic changes.
- Only the Product Ad button's heart icon is affected; other icons stay unchanged.
