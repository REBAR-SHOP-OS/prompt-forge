CREATE TABLE public.library_shares (
  owner_id uuid NOT NULL,
  viewer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, viewer_id),
  CHECK (owner_id <> viewer_id)
);
GRANT SELECT, INSERT, DELETE ON public.library_shares TO authenticated;
GRANT ALL ON public.library_shares TO service_role;
ALTER TABLE public.library_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "library_shares: participants read" ON public.library_shares FOR SELECT TO authenticated
  USING (auth.uid() = viewer_id OR auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "library_shares: admins insert" ON public.library_shares FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "library_shares: admins delete" ON public.library_shares FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.can_view_owner(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _owner IS NOT NULL AND (
    _owner = auth.uid() OR EXISTS (
      SELECT 1 FROM public.library_shares s WHERE s.owner_id = _owner AND s.viewer_id = auth.uid()
    ));
$$;

CREATE OR REPLACE FUNCTION public.visible_owner_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT array_prepend(auth.uid(), COALESCE(array_agg(s.owner_id), '{}'::uuid[]))
  FROM public.library_shares s WHERE s.viewer_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.can_view_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visible_owner_ids() TO authenticated;

CREATE POLICY "jobs: shared viewers select" ON public.generator_generation_jobs FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.can_view_owner(user_id));
CREATE POLICY "videos: shared viewers select" ON public.generator_video_assets FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.can_view_owner(user_id));
CREATE POLICY "user_images: shared viewers select" ON public.generator_user_images FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.can_view_owner(user_id));
CREATE POLICY "user_audio: shared viewers select" ON public.generator_user_audio FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.can_view_owner(user_id));
CREATE POLICY "overlays: shared viewers select" ON public.generator_clip_overlays FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.can_view_owner(user_id));
CREATE POLICY "film_exports: shared viewers select" ON public.generator_film_exports FOR SELECT TO authenticated
  USING (public.can_view_owner(user_id));
CREATE POLICY "credits: shared viewers select" ON public.billing_credit_transactions FOR SELECT TO authenticated
  USING (public.can_view_owner(user_id));

CREATE POLICY "shared viewers read library files" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id IN ('user-videos','merged-videos','user-images','user-audio','wan-frames','overlay-assets','mp4-exports')
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.can_view_owner(((storage.foldername(name))[1])::uuid)
  );