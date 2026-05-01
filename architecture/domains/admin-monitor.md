# Domain cutover plan: admin-monitor

**Cutover order: 1 of 6** (lowest risk — read-only, unauthenticated.)

## Surface today

- Backend gateway: `supabase/functions/_shared/modules/admin-monitor/gateway.ts`
- Edge endpoint: `supabase/functions/health/index.ts` → `getHealth`
- Frontend gateway: `src/modules/admin-monitor/gateway.ts`
- Tables touched: none (purely computed).

## Why first

- No DB writes, no user data, no auth.
- Used as the rehearsal for the cutover machinery itself.

## Phases

| Phase         | Action                                                                  |
|---------------|-------------------------------------------------------------------------|
| `active`      | Current state. Default.                                                  |
| `dual-write`  | Not applicable — no writes.                                              |
| `shadow-read` | New `/health` deployed alongside old; compare payloads in observability. |
| `cutover`     | Switch frontend `adminMonitorGateway` to the new endpoint URL.           |
| `frozen`      | Not applicable — no writes.                                              |
| `rolled-back` | Frontend gateway falls back to old `/health` URL.                        |

## Freeze-write plan

N/A. No writes.

## Dual-write plan

N/A. No writes.

## Rollback

```bash
# Backend (no-op — reads aren't gated)
# Frontend rebuild with:
VITE_CUTOVER_ADMIN_MONITOR=rolled-back
```

Smoke test:
```bash
curl -fsS https://<project-ref>.supabase.co/functions/v1/health | jq '.status, .cutover."admin-monitor"'
# Expect: "ok" then "rolled-back"
```

## Done criteria

- `/health` served from new surface for 24h with no payload diffs.
- `version` field bumped on the new surface; alerting confirms scrape.
