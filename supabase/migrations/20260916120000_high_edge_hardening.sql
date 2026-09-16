-- High-edge hardening, batch A.
-- Additive and data-preserving: private user images plus a persistent daily
-- quota counter for authenticated transcript/translation requests.

UPDATE storage.buckets
SET public = false
WHERE id = 'user-images';

DROP POLICY IF EXISTS "user-images: public read" ON storage.objects;
DROP POLICY IF EXISTS "user-images: users read own folder" ON storage.objects;
CREATE POLICY "user-images: users read own folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE TABLE IF NOT EXISTS public.generator_video_transcript_daily_usage (
  user_id uuid NOT NULL REFERENCES public.core_user_profiles(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.generator_video_transcript_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.generator_video_transcript_daily_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.generator_video_transcript_daily_usage TO service_role;

CREATE OR REPLACE FUNCTION public.claim_video_transcript_quota(
  _user_id uuid,
  _daily_limit integer DEFAULT 25
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_count integer;
BEGIN
  IF _user_id IS NULL OR _daily_limit < 1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.generator_video_transcript_daily_usage (
    user_id, usage_date, request_count, updated_at
  ) VALUES (
    _user_id, CURRENT_DATE, 1, now()
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE
  SET request_count = public.generator_video_transcript_daily_usage.request_count + 1,
      updated_at = now()
  WHERE public.generator_video_transcript_daily_usage.request_count < _daily_limit
  RETURNING request_count INTO claimed_count;

  RETURN claimed_count IS NOT NULL AND claimed_count <= _daily_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_video_transcript_quota(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_video_transcript_quota(uuid, integer) TO service_role;

COMMENT ON FUNCTION public.claim_video_transcript_quota(uuid, integer) IS
  'Atomically claims one authenticated video-transcript daily quota slot.';

-- Manual rollback for a coordinated application rollback only:
-- REVOKE EXECUTE ON FUNCTION public.claim_video_transcript_quota(uuid, integer) FROM service_role;
-- DROP FUNCTION public.claim_video_transcript_quota(uuid, integer);
-- DROP TABLE public.generator_video_transcript_daily_usage;
-- DROP POLICY IF EXISTS "user-images: users read own folder" ON storage.objects;
-- CREATE POLICY "user-images: public read" ON storage.objects FOR SELECT TO public
--   USING (bucket_id = 'user-images');
-- UPDATE storage.buckets SET public = true WHERE id = 'user-images';
