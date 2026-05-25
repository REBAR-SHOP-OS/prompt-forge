## Remove single-clip Final Film guard

In `src/modules/generator-ui/pages/DashboardPage.tsx` (lines 3541-3551), remove the block that blocks Final Film when there's only one clip without audio/edits and shows the message "Add music/voiceover or edit the card before finalizing."

After removal, a single clip will go through the merge pipeline normally and be saved to Final Videos just like multi-clip flows. The edit/audio addition remains fully optional for the user.

No other logic changes. The merge pipeline already handles a single clip correctly (it re-encodes and uploads to the final-videos bucket).

**File:** `src/modules/generator-ui/pages/DashboardPage.tsx` only.