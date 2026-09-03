-- Repair production drift from 20260824120000_add_generator_scenario_history.sql.
-- The scenario-write function depends on these service-role-only tables and RPCs
-- before it can return any supported duration, including 30 seconds.

CREATE TABLE IF NOT EXISTS public.generator_scenario_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint jsonb NOT NULL,
  scenario_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenario_history_user
  ON public.generator_scenario_history (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.generator_scenario_reservation (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lease_until timestamptz NOT NULL,
  token uuid NOT NULL
);

ALTER TABLE public.generator_scenario_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generator_scenario_reservation ENABLE ROW LEVEL SECURITY;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'generator_scenario_history'
       AND policyname = 'scenario history: service role only'
  ) THEN
    CREATE POLICY "scenario history: service role only"
      ON public.generator_scenario_history FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'generator_scenario_reservation'
       AND policyname = 'scenario reservation: service role only'
  ) THEN
    CREATE POLICY "scenario reservation: service role only"
      ON public.generator_scenario_reservation FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$policy$;

REVOKE ALL ON public.generator_scenario_history FROM anon, authenticated;
REVOKE ALL ON public.generator_scenario_reservation FROM anon, authenticated;
GRANT ALL ON public.generator_scenario_history TO service_role;
GRANT ALL ON public.generator_scenario_reservation TO service_role;

CREATE OR REPLACE FUNCTION public.generator_acquire_scenario_lease(
  _user_id uuid,
  _ttl_seconds integer DEFAULT 120
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _token uuid := gen_random_uuid();
  _existing timestamptz;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;

  SELECT lease_until INTO _existing
    FROM public.generator_scenario_reservation
   WHERE user_id = _user_id
   FOR UPDATE;

  IF _existing IS NULL THEN
    INSERT INTO public.generator_scenario_reservation (user_id, lease_until, token)
    VALUES (_user_id, now() + make_interval(secs => _ttl_seconds), _token);
    RETURN _token;
  ELSIF _existing < now() THEN
    UPDATE public.generator_scenario_reservation
       SET lease_until = now() + make_interval(secs => _ttl_seconds), token = _token
     WHERE user_id = _user_id;
    RETURN _token;
  ELSE
    RAISE EXCEPTION 'scenario_busy: another film is being generated for this user';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generator_release_scenario_lease(
  _user_id uuid,
  _token uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.generator_scenario_reservation
   WHERE user_id = _user_id AND token = _token;
END;
$function$;

REVOKE ALL ON FUNCTION public.generator_acquire_scenario_lease(uuid, integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.generator_release_scenario_lease(uuid, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_acquire_scenario_lease(uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.generator_release_scenario_lease(uuid, uuid)
  TO service_role;
