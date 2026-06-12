CREATE TABLE public.generator_library_state (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generator_library_state TO authenticated;
GRANT ALL ON public.generator_library_state TO service_role;

ALTER TABLE public.generator_library_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "library state: users select own"
  ON public.generator_library_state FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "library state: users insert own"
  ON public.generator_library_state FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "library state: users update own"
  ON public.generator_library_state FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "library state: users delete own"
  ON public.generator_library_state FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER set_generator_library_state_updated_at
  BEFORE UPDATE ON public.generator_library_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();