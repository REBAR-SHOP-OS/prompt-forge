-- 1. Restrict provider registry to admins only
DROP POLICY IF EXISTS "providers: authenticated read" ON public.core_ai_provider_registry;
CREATE POLICY "providers: admins select all"
  ON public.core_ai_provider_registry
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Allow users to delete their own image records
CREATE POLICY "user_images: users delete own"
  ON public.generator_user_images
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Allow users to delete their own overlays
CREATE POLICY "overlays: users delete own"
  ON public.generator_clip_overlays
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 4. Explicitly deny client writes on video assets (backend/service-role only)
CREATE POLICY "videos: deny client insert"
  ON public.generator_video_assets
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "videos: deny client update"
  ON public.generator_video_assets
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "videos: deny client delete"
  ON public.generator_video_assets
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);
