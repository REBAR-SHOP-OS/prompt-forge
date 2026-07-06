CREATE OR REPLACE FUNCTION public.generator_fail_job(_user_id uuid, _job_id uuid, _reason text DEFAULT NULL::text, _refund boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _refund_amount integer;
  _already_refunded boolean;
BEGIN
  UPDATE public.generator_generation_jobs
     SET status = 'failed',
         provider_start_claimed_at = NULL,
         provider_start_last_error = left(COALESCE(_reason, provider_start_last_error, 'job failed'), 240),
         updated_at = now()
   WHERE id = _job_id
     AND user_id = _user_id
     AND status NOT IN ('completed', 'failed', 'cancelled');

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT _refund THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.billing_credit_transactions
    WHERE job_id = _job_id
      AND type = 'refund'
  ) INTO _already_refunded;

  IF _already_refunded THEN
    RETURN;
  END IF;

  SELECT ABS(amount)
    INTO _refund_amount
  FROM public.billing_credit_transactions
  WHERE job_id = _job_id
    AND type = 'spend'
  ORDER BY created_at ASC
  LIMIT 1;

  IF _refund_amount IS NULL OR _refund_amount <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.core_user_profiles
     SET credits_balance = credits_balance + _refund_amount,
         updated_at = now()
   WHERE id = _user_id;

  INSERT INTO public.billing_credit_transactions (user_id, amount, type, job_id, description)
  VALUES (_user_id, _refund_amount, 'refund', _job_id, COALESCE(_reason, 'job:failed'));
END;
$function$;