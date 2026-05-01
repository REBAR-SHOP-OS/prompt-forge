# Domain cutover plan: generator-ui

**Cutover order: 3 of 6** (read-only `getMe`; profile data, no mutations.)

## Surface today

- Backend gateway: `supabase/functions/_shared/modules/generator-ui/gateway.ts`
- Edge endpoint: `supabase/functions/me/index.ts` → `getMe`
- Frontend gateway: `src/modules/generator-ui/gateway.ts` (also facades `routePreview` to external-api-adapter)
- Tables read (RLS-enforced): `core_user_profiles`, `user_roles`
- Tables written: none

## Why third

- Reads only; RLS already enforces ownership on both tables.
- The dashboard's bootstrap fan-out depends on this; cut over before any
  domain that the dashboard writes against (jobs, credits).

## Phases

| Phase         | Action                                                                |
|---------------|-----------------------------------------------------------------------|
| `active`      | Current state. Default.                                                |
| `dual-write`  | N/A — no writes.                                                       |
| `shadow-read` | New `getMe` deployed; compare role/credits against old for same JWT.   |
| `cutover`     | Frontend `AuthProvider.refreshProfile` calls new endpoint URL.         |
| `frozen`      | N/A — no writes.                                                       |
| `rolled-back` | Frontend reverts to old `/me`.                                         |

## Freeze-write plan

N/A. No writes.

## Dual-write plan

N/A. No writes.

## Rollback

```bash
VITE_CUTOVER_GENERATOR_UI=rolled-back
```

Smoke test (must be a real user JWT):
```bash
curl -fsS -H "Authorization: Bearer $TOKEN" \
  https://<project-ref>.supabase.co/functions/v1/me | jq '.id, .role, .credits_balance'
```

## RLS notes

Cutover does NOT modify any of:
- `profiles: users select own`
- `profiles: admins select all`
- `roles: users select own`
- `roles: admins select all`

If RLS would change, that ships as a separate, prior migration.
