-- Lock down client writes on mp4_export_jobs. All inserts/updates/deletes are
-- performed by service-role edge functions (mp4-export-create / -worker), which
-- bypass RLS. Clients may only read their own rows; everything else is denied.

REVOKE INSERT, UPDATE, DELETE ON public.mp4_export_jobs FROM authenticated, anon;
GRANT SELECT ON public.mp4_export_jobs TO authenticated;
GRANT ALL ON public.mp4_export_jobs TO service_role;

DROP POLICY IF EXISTS "mp4 jobs: no client insert" ON public.mp4_export_jobs;
CREATE POLICY "mp4 jobs: no client insert"
  ON public.mp4_export_jobs
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "mp4 jobs: no client update" ON public.mp4_export_jobs;
CREATE POLICY "mp4 jobs: no client update"
  ON public.mp4_export_jobs
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "mp4 jobs: no client delete" ON public.mp4_export_jobs;
CREATE POLICY "mp4 jobs: no client delete"
  ON public.mp4_export_jobs
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated, anon
  USING (false);