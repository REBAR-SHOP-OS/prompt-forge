-- =========================================================
-- 0001-0004 FOUNDATION (combined)
-- Note: using `public` schema with prefixed names to remain
-- compatible with Lovable Cloud / PostgREST.
-- =========================================================

-- ---------- Enums ----------
CREATE TYPE public.app_role AS ENUM ('user', 'admin');

CREATE TYPE public.job_status AS ENUM ('pending','queued','processing','completed','failed','cancelled');

CREATE TYPE public.credit_tx_type AS ENUM ('grant','spend','refund','adjustment');

-- ---------- Shared updated_at trigger fn ----------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- core_user_profiles
-- =========================================================
CREATE TABLE public.core_user_profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  credits_balance integer NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_core_user_profiles_updated
BEFORE UPDATE ON public.core_user_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- user_roles (separate table — security best practice)
-- =========================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- has_role security definer fn (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- =========================================================
-- Signup trigger: auto-create profile + default 'user' role
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.core_user_profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- generator_generation_jobs
-- =========================================================
CREATE TABLE public.generator_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.core_user_profiles(id) ON DELETE CASCADE,
  status public.job_status NOT NULL DEFAULT 'pending',
  input_prompt text NOT NULL,
  negative_prompt text,
  provider_key text,
  model_key text,
  provider_job_id text UNIQUE,
  requested_duration integer,
  requested_aspect_ratio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_gen_jobs_user ON public.generator_generation_jobs(user_id);
CREATE TRIGGER trg_gen_jobs_updated BEFORE UPDATE ON public.generator_generation_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- generator_video_assets
-- =========================================================
CREATE TABLE public.generator_video_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.generator_generation_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.core_user_profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  thumbnail_url text,
  aspect_ratio text,
  duration integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX idx_video_assets_user ON public.generator_video_assets(user_id);
CREATE TRIGGER trg_video_assets_updated BEFORE UPDATE ON public.generator_video_assets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- billing_credit_transactions
-- =========================================================
CREATE TABLE public.billing_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.core_user_profiles(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  type public.credit_tx_type NOT NULL,
  job_id uuid REFERENCES public.generator_generation_jobs(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_tx_user ON public.billing_credit_transactions(user_id);

-- =========================================================
-- audit_audit_logs
-- =========================================================
CREATE TABLE public.audit_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.core_user_profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- audit_api_request_logs
-- =========================================================
CREATE TABLE public.audit_api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES public.core_user_profiles(id) ON DELETE SET NULL,
  route text NOT NULL,
  method text NOT NULL,
  status_code integer,
  latency_ms integer,
  provider_key text,
  model_key text,
  estimated_cost numeric(12,6) NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================================================
-- core_ai_provider_registry
-- =========================================================
CREATE TABLE public.core_ai_provider_registry (
  provider_key text PRIMARY KEY,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  default_model text NOT NULL,
  base_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_provider_registry_updated BEFORE UPDATE ON public.core_ai_provider_registry
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.core_ai_provider_registry (provider_key, display_name, default_model, base_url) VALUES
  ('flow', 'Flow', 'flow-video-1', NULL),
  ('wan', 'Wan', 'wan-video-1', NULL);

-- =========================================================
-- ENABLE RLS
-- =========================================================
ALTER TABLE public.core_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generator_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generator_video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_ai_provider_registry ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- POLICIES
-- =========================================================

-- ----- core_user_profiles -----
CREATE POLICY "profiles: users select own"
ON public.core_user_profiles FOR SELECT TO authenticated
USING (id = auth.uid());

CREATE POLICY "profiles: admins select all"
ON public.core_user_profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Users may update own row but cannot change credits_balance (guard via trigger below)
CREATE POLICY "profiles: users update own"
ON public.core_user_profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "profiles: admins update all"
ON public.core_user_profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Guard trigger: prevent non-admin users from changing credits_balance via direct UPDATE
CREATE OR REPLACE FUNCTION public.guard_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.credits_balance IS DISTINCT FROM OLD.credits_balance
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'credits_balance can only be modified by admin or backend';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_profile_updates
BEFORE UPDATE ON public.core_user_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_updates();

-- ----- user_roles -----
CREATE POLICY "roles: users select own"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "roles: admins select all"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- No client write policies → service role only

-- ----- generator_generation_jobs -----
CREATE POLICY "jobs: users select own"
ON public.generator_generation_jobs FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "jobs: admins select all"
ON public.generator_generation_jobs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "jobs: users insert own"
ON public.generator_generation_jobs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "jobs: users update own non-terminal"
ON public.generator_generation_jobs FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status NOT IN ('completed','failed','cancelled'))
WITH CHECK (user_id = auth.uid());

-- ----- generator_video_assets -----
CREATE POLICY "videos: users select own"
ON public.generator_video_assets FOR SELECT TO authenticated
USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "videos: admins select all"
ON public.generator_video_assets FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- No client insert/update/delete → service role only

-- ----- billing_credit_transactions -----
CREATE POLICY "credits: users select own"
ON public.billing_credit_transactions FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "credits: admins select all"
ON public.billing_credit_transactions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- No client write policies

-- ----- audit_audit_logs -----
CREATE POLICY "audit_logs: admins select all"
ON public.audit_audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ----- audit_api_request_logs -----
CREATE POLICY "api_logs: admins select all"
ON public.audit_api_request_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ----- core_ai_provider_registry -----
CREATE POLICY "providers: authenticated read"
ON public.core_ai_provider_registry FOR SELECT TO authenticated
USING (true);
