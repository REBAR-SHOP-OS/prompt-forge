CREATE TABLE public.generator_business_profiles (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_info text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generator_business_profiles TO authenticated;
GRANT ALL ON public.generator_business_profiles TO service_role;

ALTER TABLE public.generator_business_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own business profile"
  ON public.generator_business_profiles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_business_profiles_updated_at
  BEFORE UPDATE ON public.generator_business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();