CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing_profile_id uuid;
BEGIN
  SELECT id
    INTO existing_profile_id
  FROM public.core_user_profiles
  WHERE email = NEW.email
  LIMIT 1;

  IF existing_profile_id IS NOT NULL AND existing_profile_id <> NEW.id THEN
    IF EXISTS (
      SELECT 1
      FROM auth.users existing_user
      WHERE existing_user.id = existing_profile_id
    ) THEN
      RAISE EXCEPTION 'A profile with this email already belongs to an active user';
    END IF;

    DELETE FROM public.user_roles
    WHERE user_id = existing_profile_id;

    UPDATE public.core_user_profiles
    SET id = NEW.id,
        email = NEW.email,
        updated_at = now()
    WHERE id = existing_profile_id
      AND email = NEW.email;
  ELSE
    INSERT INTO public.core_user_profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;