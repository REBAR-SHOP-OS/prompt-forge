Current behavior
----------------
`emptyContact()` initialises the contact overlay with `enabled: true`. This means the Contact button in the bottom toolbar is always highlighted/active by default, even before the user has decided to use the overlay.

Desired behavior
----------------
The Contact icon should be inactive by default. It should only turn green/active after the user explicitly toggles the "Contact overlay" switch in the popover.

Change required
---------------
1. In `src/modules/generator-ui/pages/DashboardPage.tsx`, change `enabled: true` to `enabled: false` inside `emptyContact()`.

Impact
------
- First-time users (or users with cleared localStorage) will see the Contact button in its inactive state.
- Returning users are unaffected because their saved `enabled` value from localStorage already overrides the default.
- The toggle switch inside the Contact popover continues to work exactly the same; users can still turn it on whenever they want.