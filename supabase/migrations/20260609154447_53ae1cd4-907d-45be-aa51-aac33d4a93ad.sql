DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.core_user_profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.billing_user_quotas; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.billing_credit_transactions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.generator_generation_jobs; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.core_user_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.billing_user_quotas REPLICA IDENTITY FULL;
ALTER TABLE public.billing_credit_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.generator_generation_jobs REPLICA IDENTITY FULL;