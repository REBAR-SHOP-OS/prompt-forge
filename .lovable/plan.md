# حذف کامل ویدئو از بکند و دیتابیس

در حال حاضر آیکون سطل‌زباله فقط ID را در `localStorage` کاربر اضافه می‌کند (`deletedIds`) تا کارت در UI پنهان شود. ردیف job، ردیف video asset و فایل ویدئو در Storage دست‌نخورده باقی می‌مانند. این پلن یک حذف واقعی end-to-end اضافه می‌کند.

## رفتار جدید

وقتی کاربر روی آیکون 🗑 در History (یا روی کارت ویدئو) کلیک می‌کند:
1. دیالوگ تأیید نمایش داده می‌شود.
2. درخواست به edge function جدید `jobs-delete` ارسال می‌شود.
3. بکند:
   - فایل ویدئو در Supabase Storage حذف می‌شود (در صورت وجود).
   - ردیف `generator_video_assets` به‌صورت soft-delete می‌شود (`deleted_at = now()`).
   - ردیف `generator_generation_jobs` حذف فیزیکی می‌شود (یا soft-delete، بسته به سیاست — پیش‌فرض: hard delete چون UI به آن متکی است).
4. UI کارت را از لیست حذف می‌کند و در صورت موفقیت toast «حذف شد» نشان می‌دهد. در صورت خطا، toast خطا و کارت برگردانده می‌شود.
5. ورودی مربوطه از `deletedIds`/`mergedEntries`/`approvedIds` در localStorage هم پاک می‌شود.

## تغییرات بکند

**Migration (SQL):** افزودن RPC جدید `generator_delete_job(_user_id uuid, _job_id uuid)` که:
- صاحب بودن job توسط user را چک می‌کند.
- `storage_path` همه‌ی `generator_video_assets` مرتبط را برمی‌گرداند تا gateway فایل‌ها را از Storage پاک کند.
- ردیف video assets و job را حذف می‌کند.

**Domain:** `supabase/functions/_shared/modules/job-orchestrator/`
- `contract.ts`: افزودن `deleteJob(userId, jobId, client): Promise<{ storagePaths: string[] }>` به `JobService`.
- `service.ts`: پیاده‌سازی با فراخوانی RPC جدید.
- `gateway.ts`:
  - افزودن `deleteJob` به لیست operations.
  - افزودن `DeleteJobSchema` (zod) و case جدید در switch که RPC را اجرا و سپس فایل‌ها را با `svc.storage.from(<bucket>).remove(paths)` پاک می‌کند.
  - rate limit و audit log مشابه `createJob`.

**Edge function جدید:** `supabase/functions/jobs-delete/index.ts` — هندلر POST که `jobOrchestratorGateway.handle(req, "deleteJob")` صدا می‌زند.

## تغییرات فرانت‌اند

- `src/modules/job-orchestrator/gateway.ts`: افزودن `deleteJob(jobId)` که `POST /jobs-delete` را صدا می‌زند.
- `src/modules/generator-ui/pages/DashboardPage.tsx`:
  - تابع `deleteCard` را async می‌کنیم. ابتدا optimistic از UI حذف، سپس `jobApi.deleteJob(jobId)`. در صورت خطا، rollback و toast خطا.
  - حذف entry از `mergedEntries`، `approvedIds`، `pendingEndAppends` در localStorage.
  - دیگر نیازی به `deletedIds` به‌عنوان مکانیزم اصلی نیست؛ اما برای backward-compat نگه می‌داریم تا کارت‌های قدیمیِ از قبل پنهان‌شده دوباره ظاهر نشوند.

## نکات

- حذف فیزیکی job رکوردهای credit transactions را خراب نمی‌کند (FK ندارند یا ON DELETE SET NULL است — در migration بررسی می‌شود؛ در صورت لزوم به soft-delete با ستون `deleted_at` روی `generator_generation_jobs` تغییر می‌کنیم و query لیست را فیلتر می‌کنیم).
- هیچ refund اعتباری انجام نمی‌شود (سیاست فعلی پروژه).
- فایل Storage فقط وقتی پاک می‌شود که `storage_path` یک مسیر داخلی bucket باشد (نه URL خارجی provider). مسیرهای https خارجی نادیده گرفته می‌شوند.
