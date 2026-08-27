-- PF-20260827-001-VPLY
-- Restore owner-scoped SELECT on the private `merged-videos` bucket.
--
-- Migration 20260609164603 dropped the public read policy on `merged-videos`
-- (correctly, to make the bucket private) but only added a SELECT-own policy
-- for `user-videos`. As a result, `createSignedUrl` on `merged-videos` objects
-- (Final Films) fails with a 403/RLS denial, so Final Film clips never load.
--
-- This adds the missing owner-scoped SELECT policy so a signed URL can be
-- minted for the owner's own merged-videos objects without re-opening the
-- bucket to public or cross-user access.

CREATE POLICY "merged-videos: authenticated read own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'merged-videos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);
