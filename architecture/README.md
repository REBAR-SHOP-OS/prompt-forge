# architecture/

Operational source of truth for the modular cutover plan.

| File                                | Purpose                                          |
|-------------------------------------|--------------------------------------------------|
| `migration-plan.md`                 | Global sequencing, phases, rules.                |
| `rollback-playbook.md`              | Standard rollback procedure for any domain.      |
| `domains/admin-monitor.md`          | Cutover plan #1.                                 |
| `domains/external-api-adapter.md`   | Cutover plan #2.                                 |
| `domains/generator-ui.md`           | Cutover plan #3.                                 |
| `domains/video-library.md`          | Cutover plan #4.                                 |
| `domains/job-orchestrator.md`       | Cutover plan #5.                                 |
| `domains/credit-management.md`      | Cutover plan #6 (last — money-equivalent state). |

Runtime config:
- Backend: `supabase/functions/_shared/core/cutover.ts`
- Frontend: `src/core/migration/cutover.ts`
- Observability: `/health` response includes `cutover` field with current
  phase per domain.
