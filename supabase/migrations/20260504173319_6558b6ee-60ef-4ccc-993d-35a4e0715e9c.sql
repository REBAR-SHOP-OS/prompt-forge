UPDATE public.core_ai_provider_registry
SET default_model = 'wan2.7-i2v-2026-04-25', updated_at = now()
WHERE provider_key = 'wan';