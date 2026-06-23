ALTER TABLE public.generator_business_profiles
  ADD COLUMN IF NOT EXISTS contact_website text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_address text;