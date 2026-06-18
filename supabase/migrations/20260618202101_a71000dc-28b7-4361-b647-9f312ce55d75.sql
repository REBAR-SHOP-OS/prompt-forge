DROP POLICY IF EXISTS "Users can insert their own film exports" ON public.generator_film_exports;
DROP POLICY IF EXISTS "Users can update their own film exports" ON public.generator_film_exports;
REVOKE INSERT, UPDATE ON public.generator_film_exports FROM authenticated;
GRANT ALL ON public.generator_film_exports TO service_role;