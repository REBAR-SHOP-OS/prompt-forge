## Diagnosis (why the error appeared)
- The "Not enough credits" error is **not** a daily/monthly quota issue. radin@rebar.shop has a generous quota (1500/day, only 30 used) and a monthly limit of 30000 (4270 used).
- The real cause is the **credit wallet balance** (`core_user_profiles.credits_balance`), which is **13**.
- Each WAN 2.7 Image→Video (15s) generation costs **15 credits**. Since `balance (13) < cost (15)`, `generator_start_job` raises `insufficient_credits`, which the UI surfaces as "Not enough credits for this generation."

## Fix (scoped ONLY to radin@rebar.shop)
Top up this single user's wallet by **150 credits** (≈10 WAN 2.7 generations), with an auditable transaction. No other user is affected; no schema or code changes.

Two data writes in one statement, scoped to user id `55779da2-1d7d-4ce2-b5bb-19e3dc8cfd40`:
1. `UPDATE public.core_user_profiles SET credits_balance = credits_balance + 150, updated_at = now() WHERE email = 'radin@rebar.shop';`
2. `INSERT INTO public.billing_credit_transactions (user_id, amount, type, description) VALUES ('55779da2-...','150','grant','admin grant: top-up')` — for audit trail.

(Type value will use the existing allowed transaction type; if `grant` is not permitted by the column's check/enum, use the project's existing top-up/credit type.)

## Validation
After the write, re-query the user's `credits_balance` to confirm it is `163`, and confirm a matching `+150` transaction row exists. The user can then run a generation successfully.

## Note
This is a one-time balance top-up for a single user. It does not change pricing, quotas, or the credit-deduction logic.