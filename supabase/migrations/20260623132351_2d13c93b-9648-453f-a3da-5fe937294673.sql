-- Remove the permissive UPDATE policy that let users edit server-controlled
-- columns (status, mp4_storage_path, source_storage_path, error_message).
DROP POLICY IF EXISTS "Users can update their own film exports" ON public.generator_film_exports;

-- Explicitly deny all direct client updates. Backend writes use the service
-- role, which bypasses RLS. This mirrors the deny-update pattern used by
-- generator_generation_jobs.
CREATE POLICY "Deny client updates to film exports"
ON public.generator_film_exports
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);