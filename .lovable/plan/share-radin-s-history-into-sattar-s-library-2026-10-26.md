# Share Radin's history into Sattar's library

## Goal
When sattar@rebar.shop signs in, his library also shows everything radin@rebar.shop owns:
- generated videos and jobs
- uploaded images and audio
- library items and final films
- credit usage history

Radin's items appear mixed into Sattar's library with a small "Radin" owner tag. Radin's own access does not change. The share only goes one way: Radin cannot see Sattar's items.

## Rules
- Sattar can view, play, download and reuse Radin's items (for example, use one as a start frame).
- Sattar cannot edit, rename or delete Radin's items, so nothing of Radin's can be lost by accident.
- Credits stay separate. Sattar sees Radin's spend history but is never charged for it, and Radin's balance never changes.
- The share can be switched off later by removing one record. No code change is needed.

## Technical details
1. **Database (migration):** add a new `library_shares(owner_id, viewer_id)` table with grants, row-level security and an admin-only policy for managing it. Add a security-definer helper `can_view_owner(owner uuid)` that returns `auth.uid() = owner` or a matching share row. Add new SELECT policies only, using that helper, on `generator_generation_jobs`, `generator_video_assets`, `generator_user_images`, `generator_user_audio`, `generator_clip_overlays`, `generator_film_exports` and `billing_credit_transactions`, plus the matching `storage.objects` buckets (user-videos, merged-videos, user-images, user-audio, wan-frames). Existing insert, update and delete policies stay owner-only.
2. **Data:** insert one share row: owner = Radin, viewer = Sattar.
3. **Backend list functions** (`listMyVideos`, `listMyJobs`, usage-credits): resolve the IDs visible to the caller (self plus shared owners) and query with `.in("user_id", ids)` instead of `.eq`. Return `owner_id` and `owner_email` on each item. Signed URLs are generated for shared paths only after the same check.
4. **Client:** image and audio lists keep using row-level security, so the extra rows arrive automatically. Every edit and delete control is hidden or disabled when `owner_id !== me`, and an owner tag is shown. The library-state JSON is not merged (it holds per-user layout). Shared items appear as their own read-only group.
5. **Tests:** cover the `can_view_owner` helper (owner yes, viewer yes, stranger no). Add a regression test that shared items render without delete actions. Run typecheck, build and vitest.
6. **Process:** work on a scoped branch, have it reviewed, then open a Draft PR. Nothing is published until Sattar approves.

## Risks
- These are privacy-sensitive changes. Only SELECT policies are widened, and only through the share table.
- Libraries get bigger: Sattar's loading screen will now load both libraries.
