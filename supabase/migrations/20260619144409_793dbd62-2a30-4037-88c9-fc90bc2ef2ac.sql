CREATE TABLE public.storage_objects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logical_bucket text NOT NULL,
  object_key text NOT NULL,
  backend text NOT NULL DEFAULT 'cloud',
  nas_path text,
  size_bytes bigint,
  content_type text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_objects_backend_chk CHECK (backend IN ('cloud','synology')),
  CONSTRAINT storage_objects_status_chk CHECK (status IN ('active','migrating','failed')),
  CONSTRAINT storage_objects_unique_obj UNIQUE (logical_bucket, object_key)
);

GRANT SELECT ON public.storage_objects TO authenticated;
GRANT ALL ON public.storage_objects TO service_role;

ALTER TABLE public.storage_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "storage_objects: users read own"
  ON public.storage_objects
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "storage_objects: no client insert"
  ON public.storage_objects
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "storage_objects: no client update"
  ON public.storage_objects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "storage_objects: no client delete"
  ON public.storage_objects
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated, anon
  USING (false);

CREATE INDEX idx_storage_objects_user ON public.storage_objects(user_id);
CREATE INDEX idx_storage_objects_backend ON public.storage_objects(backend);

CREATE TRIGGER trg_storage_objects_updated_at
  BEFORE UPDATE ON public.storage_objects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();