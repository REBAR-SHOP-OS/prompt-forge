-- Prompt Forge Medium backend hardening, batch 1.
-- Additive and data-preserving: atomic AI-image credit/quota accounting.

CREATE TABLE IF NOT EXISTS public.generator_ai_image_daily_usage (
  user_id uuid NOT NULL REFERENCES public.core_user_profiles(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  reserved_provider_calls integer NOT NULL DEFAULT 0 CHECK (reserved_provider_calls >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS public.generator_ai_image_requests (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.core_user_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'failed')),
  reserved_provider_calls integer NOT NULL CHECK (reserved_provider_calls BETWEEN 1 AND 6),
  consumed_provider_calls integer NOT NULL DEFAULT 0 CHECK (consumed_provider_calls BETWEEN 0 AND 6),
  credit_cost integer NOT NULL CHECK (credit_cost > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generator_ai_image_requests_user_created
  ON public.generator_ai_image_requests (user_id, created_at DESC);

ALTER TABLE public.generator_ai_image_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generator_ai_image_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.generator_ai_image_daily_usage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.generator_ai_image_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.generator_ai_image_daily_usage TO service_role;
GRANT ALL ON public.generator_ai_image_requests TO service_role;

CREATE OR REPLACE FUNCTION public.claim_ai_image_request(
  _user_id uuid,
  _request_id uuid,
  _reserved_provider_calls integer DEFAULT 6,
  _daily_provider_call_limit integer DEFAULT 120,
  _credit_cost integer DEFAULT 6
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _balance integer;
  _reserved integer;
BEGIN
  IF _user_id IS NULL OR _request_id IS NULL THEN
    RAISE EXCEPTION 'AI image request identity required';
  END IF;
  IF _reserved_provider_calls < 1 OR _reserved_provider_calls > 6 OR
     _daily_provider_call_limit < _reserved_provider_calls OR
     _credit_cost <> _reserved_provider_calls THEN
    RAISE EXCEPTION 'invalid AI image accounting limits';
  END IF;

  SELECT credits_balance
    INTO _balance
    FROM public.core_user_profiles
   WHERE id = _user_id
   FOR UPDATE;

  IF _balance IS NULL THEN
    RETURN 'profile_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.generator_ai_image_requests
     WHERE id = _request_id
       AND user_id = _user_id
  ) THEN
    RETURN 'duplicate';
  END IF;

  IF _balance < _credit_cost THEN
    RETURN 'insufficient_credits';
  END IF;

  INSERT INTO public.generator_ai_image_daily_usage (
    user_id, usage_date, reserved_provider_calls, updated_at
  ) VALUES (
    _user_id, CURRENT_DATE, _reserved_provider_calls, now()
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE
     SET reserved_provider_calls =
           public.generator_ai_image_daily_usage.reserved_provider_calls
           + EXCLUDED.reserved_provider_calls,
         updated_at = now()
   WHERE public.generator_ai_image_daily_usage.reserved_provider_calls
         + EXCLUDED.reserved_provider_calls <= _daily_provider_call_limit
  RETURNING reserved_provider_calls INTO _reserved;

  IF _reserved IS NULL OR _reserved > _daily_provider_call_limit THEN
    RETURN 'quota_exceeded';
  END IF;

  INSERT INTO public.generator_ai_image_requests (
    id, user_id, status, reserved_provider_calls, consumed_provider_calls, credit_cost
  ) VALUES (
    _request_id, _user_id, 'reserved', _reserved_provider_calls, 0, _credit_cost
  );

  UPDATE public.core_user_profiles
     SET credits_balance = credits_balance - _credit_cost,
         updated_at = now()
   WHERE id = _user_id;

  INSERT INTO public.billing_credit_transactions (
    user_id, amount, type, description
  ) VALUES (
    _user_id,
    -_credit_cost,
    'spend',
    'ai-image-generate:' || _request_id::text
  );

  RETURN 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_ai_image_request(
  _user_id uuid,
  _request_id uuid,
  _consumed_provider_calls integer,
  _succeeded boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request public.generator_ai_image_requests%ROWTYPE;
  _consumed integer;
  _unused integer;
  _refund_credits integer;
BEGIN
  SELECT *
    INTO _request
    FROM public.generator_ai_image_requests
   WHERE id = _request_id
     AND user_id = _user_id
   FOR UPDATE;

  IF NOT FOUND OR _request.status <> 'reserved' THEN
    RETURN false;
  END IF;

  _consumed := LEAST(
    GREATEST(COALESCE(_consumed_provider_calls, 0), 0),
    _request.reserved_provider_calls
  );
  _unused := _request.reserved_provider_calls - _consumed;
  _refund_credits := GREATEST(_request.credit_cost - _consumed, 0);

  UPDATE public.generator_ai_image_requests
     SET status = CASE WHEN _succeeded THEN 'completed' ELSE 'failed' END,
         consumed_provider_calls = _consumed,
         settled_at = now(),
         updated_at = now()
   WHERE id = _request_id
     AND user_id = _user_id;

  IF _unused > 0 THEN
    UPDATE public.generator_ai_image_daily_usage
       SET reserved_provider_calls = GREATEST(reserved_provider_calls - _unused, 0),
           updated_at = now()
     WHERE user_id = _user_id
       AND usage_date = _request.created_at::date;
  END IF;

  IF _refund_credits > 0 THEN
    UPDATE public.core_user_profiles
       SET credits_balance = credits_balance + _refund_credits,
           updated_at = now()
     WHERE id = _user_id;

    INSERT INTO public.billing_credit_transactions (
      user_id, amount, type, description
    ) VALUES (
      _user_id,
      _refund_credits,
      'refund',
      'ai-image-generate-refund:' || _request_id::text
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_image_request(uuid, uuid, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_image_request(uuid, uuid, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_image_request(uuid, uuid, integer, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_image_request(uuid, uuid, integer, boolean)
  TO service_role;

COMMENT ON FUNCTION public.claim_ai_image_request(uuid, uuid, integer, integer, integer) IS
  'Atomically reserves the bounded AI-image provider-call quota and worst-case provider-call credits.';
COMMENT ON FUNCTION public.settle_ai_image_request(uuid, uuid, integer, boolean) IS
  'Idempotently records actual AI-image provider calls and refunds unused quota and reserved credits.';

-- Manual rollback for a coordinated application rollback only:
-- REVOKE EXECUTE ON FUNCTION public.settle_ai_image_request(uuid, uuid, integer, boolean) FROM service_role;
-- REVOKE EXECUTE ON FUNCTION public.claim_ai_image_request(uuid, uuid, integer, integer, integer) FROM service_role;
-- DROP FUNCTION public.settle_ai_image_request(uuid, uuid, integer, boolean);
-- DROP FUNCTION public.claim_ai_image_request(uuid, uuid, integer, integer, integer);
-- DROP TABLE public.generator_ai_image_requests;
-- DROP TABLE public.generator_ai_image_daily_usage;
