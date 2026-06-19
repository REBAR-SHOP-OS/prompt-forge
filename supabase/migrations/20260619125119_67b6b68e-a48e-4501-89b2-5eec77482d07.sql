CREATE POLICY "Users can insert their own film exports"
ON public.generator_film_exports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own film exports"
ON public.generator_film_exports
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);