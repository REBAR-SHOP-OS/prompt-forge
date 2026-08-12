-- Explicit, persistent image-type metadata for generator_user_images.
--
-- Distinguishes a plain character reference from a multi-view character sheet
-- (a single image with several turnaround views + facial expressions of ONE
-- person). The sheet must be treated as a single identity by the generator and
-- the identity evaluator.
--
-- Values:
--   'character'        -> a plain character reference (single portrait/photo).
--   'character_sheet'  -> a multi-view character sheet (generated or explicitly
--                         marked by the user on manual upload).
--   NULL               -> legacy/unknown. Callers MUST NOT guess from title or
--                         URL for new data; NULL is only a backward-compatible
--                         fallback for rows written before this column existed.
--
-- This migration is additive and reversible: it only adds a nullable column
-- with no default, so no existing row is rewritten and no type is guessed for
-- legacy records. Rollback = DROP COLUMN.

ALTER TABLE public.generator_user_images
  ADD COLUMN IF NOT EXISTS image_type text;

-- Constrain to the known values so a typo cannot silently create a new type.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generator_user_images_image_type_check'
  ) THEN
    ALTER TABLE public.generator_user_images
      ADD CONSTRAINT generator_user_images_image_type_check
      CHECK (image_type IS NULL OR image_type IN ('character', 'character_sheet'));
  END IF;
END $$;
