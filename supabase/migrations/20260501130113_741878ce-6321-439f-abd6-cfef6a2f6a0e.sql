-- Intentionally left as a no-op.
--
-- A previous version of this migration attempted to mutate a hard-coded
-- profile row and temporarily disable user triggers. That behavior is unsafe
-- for shared environments and does not belong in the product migration stream.
--
-- Keep environment-specific credit seeding in an operator runbook or a
-- dedicated non-production seed step instead.
SELECT 1;
