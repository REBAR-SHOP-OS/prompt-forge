CREATE OR REPLACE FUNCTION public.generator_start_job(_user_id uuid, _prompt text, _provider_key text, _model_key text, _cost integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  VALUES (_user_id, -_debit, 'spend', _job_id, 'job:start');

  RETURN _job_id;
END;
$function$;