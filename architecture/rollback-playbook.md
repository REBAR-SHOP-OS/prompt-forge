# Rollback playbook

A rollback is **the same deploy** as the cutover, with a single env flip.
We never ship "rollback code" — we ship "phase-aware code" once, then move
the phase pointer.

---

## Phase pointer

Backend env var: `CUTOVER_<DOMAIN_UPPER_SNAKE>`
Frontend env var: `VITE_CUTOVER_<DOMAIN_UPPER_SNAKE>` (build-time)

Valid values: `active | dual-write | shadow-read | cutover | frozen | rolled-back`

---

## Standard rollback sequence

> Total target time: under 5 minutes for read-heavy domains,
> under 15 minutes for write-bearing domains (jobs, credits).

1. **Detect** — alert fires, SLO breach, or an operator declares incident.
2. **Halt traffic on the new surface** — set
   `CUTOVER_<DOMAIN>=rolled-back`. This makes the new surface refuse writes
   immediately. Reads on the new surface stop being served by gateway code
   that respects `isWriteAllowed`.
3. **Restore old surface as canonical** — set whichever upstream router or
   DNS/feature flag points clients back to the old endpoint. For Phase 4 we
   are still mono-deploy, so step 3 is a no-op (the old surface never went
   away).
4. **Verify** — hit `/health` and confirm `cutover.<domain> === "rolled-back"`.
   Run the per-domain smoke test listed in `./domains/<domain>.md`.
5. **Reconcile** — if the domain was in `dual-write`, replay any writes that
   landed only on the new surface back to the old (per-domain reconciliation
   query lives in each domain doc).
6. **Postmortem** — capture cause; do not re-attempt cutover until the root
   cause is fixed and the per-domain plan is updated.

---

## What rollback does NOT change

- Database schema (no destructive migrations are part of cutover).
- RLS policies (cutover never touches policy).
- Auth surface (login/session continues to work; only the domain's writes are
  rejected).
- The user-visible UI (frontend reads still work).

---

## When NOT to roll back

- Read-only failures on the new surface — fall back to old surface reads
  without flipping the phase. The system is designed so reads never depend on
  phase.
- Single-user errors — investigate first; do not flip the global phase for
  one user's bad input.

---

## Per-domain rollback notes

Each `./domains/<domain>.md` includes a `Rollback` section with:
- the exact env vars to flip
- the smoke-test command to confirm restoration
- any reconciliation query needed if writes diverged
