-- product_folders: durable metadata for user-created "product photo folders".
--
-- Actual folder photos are rows in generator_user_images, grouped purely by a
-- `products/<folderId>/` segment in storage_path (see groupProductPhotos() /
-- storedProductFolderId() in src/modules/generator-ui/lib/productPhotoGroups.ts).
-- A folder created with zero photos has no such row to derive a group from, so
-- without a durable record the folder disappears the moment the page remounts
-- (the in-memory draft folder is component state only). This table is that
-- durable record — one row per folder, written at creation time. It is never
-- consulted for folder CONTENTS (generator_user_images stays the source of
-- truth for that); it only guarantees an empty folder still EXISTS after a
-- reload, and stays untouched once photos start landing in it.

CREATE TABLE public.product_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_folder_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, storage_folder_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_folders TO authenticated;
GRANT ALL ON public.product_folders TO service_role;

ALTER TABLE public.product_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_folders: users select own"
  ON public.product_folders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "product_folders: users insert own"
  ON public.product_folders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "product_folders: users update own"
  ON public.product_folders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "product_folders: users delete own"
  ON public.product_folders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_product_folders_user_created
  ON public.product_folders (user_id, created_at DESC);
