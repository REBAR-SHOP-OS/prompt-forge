# Domain cutover plan: external-api-adapter

**Cutover order: 2 of 6** (stateless route resolution + cost preview.)

## Surface today

- Backend gateway: `supabase/functions/_shared/modules/external-api-adapter/gateway.ts`
- Edge endpoint: `supabase/functions/ai-gateway-route-preview/index.ts` → `routePreview`
- Frontend gateway: `src/modules/external-api-adapter/gateway.ts`
- Tables read (RLS-enforced): `core_ai_provider_registry`
- Tables written (service role): `audit_api_request_logs`, `audit_audit_logs`

## Why second

- No user-owned write state; only audit/log writes which are append-only and
  idempotent on `request_id`.
- Stateless resolution → trivial to dual-write without divergence.

## Phases

| Phase         | Action                                                                                            |
|---------------|---------------------------------------------------------------------------------------------------|
| `active`      | Current state. Default.                                                                            |
| `dual-write`  | New surface also writes audit/log rows. Duplicates are tolerated (read-side dedupes by request_id).|
| `shadow-read` | Side-by-side comparison of `resolvedModel`/`estimatedCost` between old and new for same input.     |
| `cutover`     | Frontend gateway points at new endpoint URL. Old endpoint frozen for new requests.                 |
| `frozen`      | Old endpoint returns 503 with `code=FROZEN`. ~1 min window during commit.                          |
| `rolled-back` | New endpoint returns 503; frontend reverts to old endpoint URL.                                    |

## Freeze-write plan

1. Set `CUTOVER_EXTERNAL_API_ADAPTER=frozen` on the old surface.
2. Old gateway's `routePreview` operation rejects with `FROZEN` (gateway will
   call `isWriteAllowed("external-api-adapter")` once enforcement is wired in
   Phase 5).
3. Wait until in-flight requests drain (rate-limit window: 60s).
4. Set `CUTOVER_EXTERNAL_API_ADAPTER=cutover` on the new surface.

## Dual-write plan

- Window: up to 24h.
- Write target: `audit_api_request_logs` rows. Same `request_id` makes
  duplicates safe; analytics MUST `SELECT DISTINCT ON (request_id)`.
- No `billing_credit_transactions` involvement — this domain doesn't charge.

## Rollback

```bash
# Backend
CUTOVER_EXTERNAL_API_ADAPTER=rolled-back
# Frontend rebuild with
VITE_CUTOVER_EXTERNAL_API_ADAPTER=rolled-back
```

Smoke test:
```bash
TOKEN=...   # any logged-in user JWT
curl -fsS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"providerKey":"flow","prompt":"smoke test"}' \
  https://<project-ref>.supabase.co/functions/v1/ai-gateway-route-preview \
  | jq '.resolvedModel, .estimatedCost'
```

Reconciliation (audit log de-dupe sanity):
```sql
SELECT request_id, COUNT(*) FROM audit_api_request_logs
WHERE route LIKE '%route-preview%' AND created_at > now() - interval '1 day'
GROUP BY request_id HAVING COUNT(*) > 1;
```
Duplicates expected during dual-write window; should drop to 0 after cutover.
