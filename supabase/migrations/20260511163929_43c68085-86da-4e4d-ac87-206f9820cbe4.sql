-- One-shot purge of all previously soft-deleted records.
-- Their storage_paths are external provider URLs (Aliyun OSS) that expire
-- on their own, so no Storage bucket cleanup is required.

DELETE FROM public.generator_clip_overlays WHERE deleted_at IS NOT NULL;
DELETE FROM public.generator_video_assets  WHERE deleted_at IS NOT NULL;
DELETE FROM public.generator_generation_jobs WHERE deleted_at IS NOT NULL;
DELETE FROM public.generator_user_images   WHERE deleted_at IS NOT NULL;