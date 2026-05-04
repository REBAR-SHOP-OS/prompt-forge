CREATE OR REPLACE FUNCTION public.guard_profile_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.credits_balance IS DISTINCT FROM OLD.credits_balance
     AND auth.role() <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'credits_balance can only be modified by admin or backend';
  END IF;
  RETURN NEW;
END;
$function$;