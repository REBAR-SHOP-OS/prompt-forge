## Goal

Make the bottom prompt bar as wide as the main video preview area (matching the area circled in orange), instead of the current centered ~720 px box.

## Change

In `src/modules/generator-ui/pages/DashboardPage.tsx` at line 2053, the form currently uses:

```
w-[min(45rem,calc(100vw-1rem))] ... sm:w-[min(45rem,calc(100vw-2rem))]
```

Update it to match the dashboard's main preview width (which leaves room for the ~26 rem right sidebar):

```
w-[min(96rem,calc(100vw-2rem))] ... sm:w-[min(96rem,calc(100vw-26rem))]
```

This mirrors the sizing already used by the video preview frame, so the prompt bar visually aligns with it on every breakpoint and the right sidebar is never overlapped.

## Out of Scope
- No layout changes to the inner controls (mode tabs, duration, aspect ratio, prompt input). They will simply have more horizontal room and naturally spread out via the existing `flex-wrap`.
