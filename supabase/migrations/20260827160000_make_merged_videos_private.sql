-- PF-20260827-002-PRIV
-- Make the `merged-videos` bucket private.
--
-- The bucket was created public (20260504180912) and re-asserted public
-- (20260507134103). Dropping the "Public read merged-videos" SELECT policy in
-- 20260609164603 did NOT make the bucket private: for a public bucket,
-- `GET /storage/v1/object/public/merged-videos/<path>` serves objects
-- anonymously and never consults `storage.objects` RLS. So every user's merged
-- video has remained anonymously readable by anyone who knows or guesses its
-- path.
--
-- This migration flips the bucket to private. After this, anonymous public
-- reads are rejected and the owner-scoped SELECT policy added in
-- 20260827150000 governs signing/listing only (as intended).
--
-- Rollback: UPDATE storage.buckets SET public = true WHERE id = 'merged-videos';

UPDATE storage.buckets SET public = false WHERE id = 'merged-videos';
