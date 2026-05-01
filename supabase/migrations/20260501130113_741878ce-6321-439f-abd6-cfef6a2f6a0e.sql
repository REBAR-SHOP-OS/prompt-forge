ALTER TABLE public.core_user_profiles DISABLE TRIGGER USER;

UPDATE public.core_user_profiles
SET credits_balance = 50, updated_at = now()
WHERE id = '55779da2-1d7d-4ce2-b5bb-19e3dc8cfd40';

ALTER TABLE public.core_user_profiles ENABLE TRIGGER USER;