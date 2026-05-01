# Architecture / Migration sequencing (Phase 4)

This directory is the operational source of truth for moving each domain off
this monolith and onto its own surface (separate edge function group, separate
service, or separate repo) **one at a time**, using a strangler-fig pattern.

> Phase 4 only **plans and scaffolds**. No domain is being cut over yet.
> Every domain currently sits at phase `active` (see `cutover.ts`).

---

## Cutover order (lowest blast-radius → highest)

The order is chosen so that each step depends only on already-stable surfaces
and so that any failure halts before touching credit/RLS-critical data.

| # | Domain                  | Why this position                                                                 |
|---|-------------------------|-----------------------------------------------------------------------------------|
| 1 | `admin-monitor`         | Read-only, unauthenticated `/health`. No user data, no writes. Safe rehearsal.    |
| 2 | `external-api-adapter`  | Stateless route resolution + cost preview. No persistent writes the user owns.    |
| 3 | `generator-ui`          | Read-only `getMe`. Profile data, but no mutations, RLS already proven.            |
| 4 | `video-library`         | Read-only listings; writes don't exist yet. Cut over before jobs, since jobs ref videos. |
| 5 | `job-orchestrator`      | First domain with real user-write semantics in later phases. Requires freeze plan. |
| 6 | `credit-management`     | Money-equivalent state. Cut over LAST so we have proven the freeze/dual-write/rollback machinery on cheaper domains first. |

Per-domain plans live in `./domains/<domain>.md`.
The rollback playbook lives in `./rollback-playbook.md`.

---

## Strangler-fig phases (reused from `cutover.ts`)

```
active → dual-write → shadow-read → cutover → (frozen during commit) → done
                                              ↘ rolled-back
```

| Phase         | Old surface | New surface | Notes                                       |
|---------------|-------------|-------------|---------------------------------------------|
| `active`      | reads+writes | none        | Default. Phase 4 leaves every domain here.  |
| `dual-write`  | reads+writes | writes only | New surface accepts writes but old is canon |
| `shadow-read` | reads+writes | reads compared | New reads compared to old; old still canon |
| `cutover`     | rejects writes | reads+writes | New is canonical                           |
| `frozen`      | rejects writes | rejects writes | Brief window during commit. Use sparingly. |
| `rolled-back` | reads+writes | rejects writes | Emergency revert.                          |

The phase per domain is read at runtime by:
- Backend: `supabase/functions/_shared/core/cutover.ts` → `getDomainPhase(...)`
- Frontend: `src/core/migration/cutover.ts` → `getDomainPhase(...)`

Override via env (no code change required):
- Backend: `CUTOVER_<DOMAIN_UPPER_SNAKE>=<phase>` (e.g. `CUTOVER_VIDEO_LIBRARY=dual-write`)
- Frontend: `VITE_CUTOVER_<DOMAIN_UPPER_SNAKE>=<phase>`

The current map is also surfaced in `/health`'s `cutover` field for ops visibility.

---

## Global rules

1. **Never cut over a write-bearing domain without a freeze window.** Even a
   1-second freeze is acceptable; zero is not.
2. **Reads are not gated by phase.** Cutover code only blocks writes, so a bad
   phase value cannot accidentally take the app down for read-only flows.
3. **Always have a rollback path on the same deploy.** A cutover and its
   rollback are the same code shipped together; only env flips them.
4. **One domain in flight at a time.** Never run two domains in `dual-write`
   or `cutover` simultaneously.
5. **No RLS rewrites during cutover.** Cutover changes ingress, not policy.
   Any RLS change ships in a separate, prior migration.
