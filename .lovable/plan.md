# Close library drawer on outside click

## Goal
When the library drawer is open, clicking anywhere outside it (on the page) should close it, so the user no longer has to press the X icon every time.

## Current behavior
In `src/modules/generator-ui/pages/DashboardPage.tsx`:
- The library panel is an `<aside>` controlled by `isApprovedPanelOpen` (line ~9834).
- A full-screen dimming backdrop button exists (line ~9825) that closes the drawer on click — but it is restricted to mobile via the `lg:hidden` class, so on desktop there is no click-away region.

## Change
Make the existing backdrop work on all screen sizes by removing the `lg:hidden` restriction, and make it transparent on larger screens so the desktop layout isn't dimmed (keep the subtle dim only on small screens where the drawer overlays content).

- Update the backdrop button className so it is always rendered/clickable when the panel is open, using `bg-black/35` on small screens and `lg:bg-transparent` on large screens.
- The backdrop sits at `z-20`, below the aside at `z-40`, so clicks on the drawer itself are unaffected — only clicks outside close it.

This is the minimal change and keeps the existing X icon and mobile behavior intact.

## Technical detail
Single className edit on the backdrop button (line ~9828): replace `transition lg:hidden` with `transition lg:bg-transparent` (and ensure pointer-events stay enabled when open across all breakpoints).
