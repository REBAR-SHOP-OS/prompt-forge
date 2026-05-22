
-- 1) Restrict client UPDATE on core_user_profiles to non-sensitive columns via restrictive policy.
-- The guard_profile_updates trigger already blocks credits_balance/email changes, but we add
-- a restrictive RLS policy as defense-in-depth so a UPDATE that touches these columns is rejected
-- before the trigger fires for non-admin clients.
DROP POLICY IF EXISTS "profiles: deny client sensitive updates" ON public.core_user_profiles;
CREATE POLICY "profiles: deny client sensitive updates"
ON public.core_user_profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    credits_balance IS NOT DISTINCT FROM credits_balance
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    credits_balance = (SELECT p.credits_balance FROM public.core_user_profiles p WHERE p.id = auth.uid())
    AND email = (SELECT p.email FROM public.core_user_profiles p WHERE p.id = auth.uid())
  )
);

-- 2) Explicit deny write policies on audit tables.
DROP POLICY IF EXISTS "api_logs: deny client insert" ON public.audit_api_request_logs;
DROP POLICY IF EXISTS "api_logs: deny client update" ON public.audit_api_request_logs;
DROP POLICY IF EXISTS "api_logs: deny client delete" ON public.audit_api_request_logs;
CREATE POLICY "api_logs: deny client insert" ON public.audit_api_request_logs
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "api_logs: deny client update" ON public.audit_api_request_logs
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "api_logs: deny client delete" ON public.audit_api_request_logs
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "audit_logs: deny client insert" ON public.audit_audit_logs;
DROP POLICY IF EXISTS "audit_logs: deny client update" ON public.audit_audit_logs;
DROP POLICY IF EXISTS "audit_logs: deny client delete" ON public.audit_audit_logs;
CREATE POLICY "audit_logs: deny client insert" ON public.audit_audit_logs
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "audit_logs: deny client update" ON public.audit_audit_logs
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "audit_logs: deny client delete" ON public.audit_audit_logs
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- 3) Explicit deny write policies on billing_credit_transactions.
DROP POLICY IF EXISTS "credits: deny client insert" ON public.billing_credit_transactions;
DROP POLICY IF EXISTS "credits: deny client update" ON public.billing_credit_transactions;
DROP POLICY IF EXISTS "credits: deny client delete" ON public.billing_credit_transactions;
CREATE POLICY "credits: deny client insert" ON public.billing_credit_transactions
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "credits: deny client update" ON public.billing_credit_transactions
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "credits: deny client delete" ON public.billing_credit_transactions
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);
