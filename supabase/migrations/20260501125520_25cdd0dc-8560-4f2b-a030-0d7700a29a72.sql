-- 1) Atomic job start: validates credit, creates pending job, debits credits, logs transaction.
CREATE OR REPLACE FUNCTION public.generator_start_job(
  _user_id uuid,
  _prompt text,
  _provider_key text,
  _model_key text,
  _cost integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance integer;
  _job_id uuid;
  _debit integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;
  IF _prompt IS NULL OR length(btrim(_prompt)) = 0 THEN
    RAISE EXCEPTION 'prompt required';
  END IF;

  _debit := GREATEST(_cost, 1);

  SELECT credits_balance INTO _balance
  FROM public.core_user_profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF _balance IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
  IF _balance < _debit THEN
    RAISE EXCEPTION 'insufficient credits';
  END IF;

  INSERT INTO public.generator_generation_jobs (user_id, input_prompt, provider_key, model_key, status)
  VALUES (_user_id, _prompt, _provider_key, _model_key, 'pending')
  RETURNING id INTO _job_id;

  UPDATE public.core_user_profiles
     SET credits_balance = credits_balance - _debit,
         updated_at = now()
   WHERE id = _user_id;

  INSERT INTO public.billing_credit_transactions (user_id, amount, type, job_id, description)
  VALUES (_user_id, -_debit, 'debit', _job_id, 'job:start');

  RETURN _job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generator_start_job(uuid, text, text, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_start_job(uuid, text, text, text, integer) TO service_role;

-- 2) Atomic job completion: writes the asset and flips status.
CREATE OR REPLACE FUNCTION public.generator_complete_job(
  _user_id uuid,
  _job_id uuid,
  _storage_path text,
  _thumbnail_url text,
  _aspect_ratio text,
  _duration integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _asset_id uuid;
BEGIN
  UPDATE public.generator_generation_jobs
     SET status = 'completed', updated_at = now()
   WHERE id = _job_id AND user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'job not found for user';
  END IF;

  INSERT INTO public.generator_video_assets (user_id, job_id, storage_path, thumbnail_url, aspect_ratio, duration)
  VALUES (_user_id, _job_id, _storage_path, _thumbnail_url, _aspect_ratio, _duration)
  RETURNING id INTO _asset_id;

  RETURN _asset_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generator_complete_job(uuid, uuid, text, text, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_complete_job(uuid, uuid, text, text, text, integer) TO service_role;

-- 3) Mark job processing (used between start and complete)
CREATE OR REPLACE FUNCTION public.generator_mark_job_processing(
  _user_id uuid,
  _job_id uuid,
  _provider_job_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.generator_generation_jobs
     SET status = 'processing',
         provider_job_id = COALESCE(_provider_job_id, provider_job_id),
         updated_at = now()
   WHERE id = _job_id AND user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generator_mark_job_processing(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_mark_job_processing(uuid, uuid, text) TO service_role;