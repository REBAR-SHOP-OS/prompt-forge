CREATE OR REPLACE FUNCTION public.generator_delete_user_image(_user_id uuid, _image_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _path text;
BEGIN
  IF _user_id IS NULL OR _image_id IS NULL THEN
    RAISE EXCEPTION 'user_id and image_id required';
  END IF;

  UPDATE public.generator_user_images
     SET deleted_at = now(), updated_at = now()
   WHERE id = _image_id
     AND user_id = _user_id
     AND deleted_at IS NULL
  RETURNING storage_path INTO _path;

  IF _path IS NULL THEN
    -- Already deleted or not owned; treat as no-op rather than error.
    RETURN NULL;
  END IF;

  RETURN _path;
END;
$function$;