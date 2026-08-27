-- generator_scenario_history + generator_scenario_reservation:
-- persistent, user-scoped anti-duplicate detection for "Make Full Film".
--
-- Why backend (not localStorage): the existing prompt-level history lives in
-- browser localStorage (src/modules/generator-ui/lib/promptHistory.ts), which is
-- per-browser/device and cannot guarantee uniqueness across sessions or devices.
-- The spec requires History to be bounded and user-scoped using ONLY persistent
-- backend data, so scenario fingerprints are stored server-side keyed by the
-- authenticated user.
--
-- Each history row stores a compact comparable fingerprint (jsonb) plus the full
-- scenario text (needed by the Stage-2 semantic judge). The 20-item cap is NOT a
-- detection boundary: the edge function reads ALL of a user's history (paginated)
-- and compares against every entry. The fingerprint is compact so the fast
-- Stage-1 pass stays cheap even as history grows.
--
-- Concurrency: a per-user lease (generator_scenario_reservation) serializes the
-- whole generate→check→insert operation. Two concurrent requests for the same
-- user cannot both accept a similar concept: the second fails fast (409) while
-- the first holds the lease. The lease is acquired atomically via an RPC and
-- released in a finally block; a stale lease (edge function crash) expires via
-- lease_until and is taken over by the next request.

CREATE TABLE public.generator_scenario_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint jsonb NOT NULL,
  scenario_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scenario_history_user
  ON public.generator_scenario_history (user_id, created_at DESC);

CREATE TABLE public.generator_scenario_reservation (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lease_until timestamptz NOT NULL,
  token uuid NOT NULL
);

-- RLS: clients never read or write these tables directly. Only the service role
-- (edge functions, which bypass RLS) manages them. This mirrors the deny-client
-- pattern used by generator_copyright_reviews and the export tables.
ALTER TABLE public.generator_scenario_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generator_scenario_reservation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scenario history: service role only"
  ON public.generator_scenario_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "scenario reservation: service role only"
  ON public.generator_scenario_reservation FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.generator_scenario_history TO service_role;
GRANT ALL ON public.generator_scenario_reservation TO service_role;

-- ---------------------------------------------------------------------------
-- Lease RPCs (service-role only). Acquire is atomic: insert if absent, take
-- over if expired, otherwise raise a clear "busy" error so the caller fails
-- closed (409) instead of racing.
-- ---------------------------------------------------------------------------

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

REVOKE ALL ON FUNCTION public.generator_acquire_scenario_lease(uuid, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.generator_release_scenario_lease(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generator_acquire_scenario_lease(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generator_release_scenario_lease(uuid, uuid) TO service_role;
