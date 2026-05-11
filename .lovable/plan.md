## مشکل

با کلیک روی آیکون سطل آشغال:
- در پنل **History**: `deleteJob` صدا زده می‌شود ولی RPC پشت آن (`generator_delete_job`) فقط `deleted_at = now()` ست می‌کند (soft delete). علاوه بر آن، در gateway فقط باکت‌های `merged-videos` و `wan-frames` از Storage پاک می‌شوند؛ باکت اصلی ویدیوهای تولیدشده (`user-videos`) اصلاً پاک نمی‌شود → فایل روی سرور باقی می‌ماند.
- در پنل **Library** (Saved videos): همان `deleteCard` صدا زده می‌شود؛ برای آیتم‌های merged فقط فایل از باکت پاک می‌شود اما برای job واقعی همان مشکل soft-delete + باکت گم‌شده وجود دارد.

نتیجه: فایل ویدیو روی Storage و رکورد در DB واقعاً حذف نمی‌شوند.

## هدف

با کلیک trash، ویدیو **به‌طور دائمی** هم از دیتابیس و هم از Storage حذف شود.

## تغییرات

### 1) Migration دیتابیس — تبدیل soft-delete به hard-delete برای jobs

تابع `public.generator_delete_job(_user_id uuid, _job_id uuid)` بازنویسی شود تا:
- ابتدا `storage_path` تمام `generator_video_assets` متعلق به آن job را برگرداند.
- سپس ردیف‌های `generator_video_assets` و `generator_generation_jobs` متعلق به آن کاربر/job را با `DELETE` واقعی پاک کند (نه `UPDATE deleted_at`).
- خروجی همان `RETURNS TABLE(storage_path text)` باقی بماند تا قرارداد با gateway تغییر نکند.
- اگر job متعلق به کاربر نباشد، `RAISE EXCEPTION 'job not found for user'` (بدون تغییر).

نکته: trigger `guard_generation_job_updates` فقط روی UPDATE است؛ DELETE تحت تأثیر آن نیست. RLS `jobs: deny client delete` هم مهم نیست چون RPC با `SECURITY DEFINER` اجرا می‌شود.

### 2) Backend — افزودن باکت `user-videos` به لیست پاک‌سازی Storage

`supabase/functions/_shared/modules/job-orchestrator/gateway.ts` (case `deleteJob`):
- آرایه `KNOWN_BUCKETS` از `["merged-videos", "wan-frames"]` به `["merged-videos", "wan-frames", "user-videos"]` گسترش یابد تا فایل ویدیوی اصلی هم از Storage پاک شود.

### 3) بدون تغییر در Frontend

`deleteCard` در `DashboardPage.tsx` همین الان optimistic remove + فراخوانی `jobOrchestratorGateway.deleteJob` انجام می‌دهد. با تغییرات بالا، نتیجه دائمی خواهد شد. هیچ تغییری لازم نیست.

## خارج از scope

- حذف دائمی تصاویر کاربر (`generator_delete_user_image`) — کاربر فقط روی فیلم تأکید کرد.
- تغییر در آیتم‌های merged محلی — همین الان فایل را از باکت پاک می‌کنند و در state نگهداری می‌شوند.
- تغییر RLS، contract، یا frontend gateway.

## تأیید

- ساخت یک ویدیو → کلیک trash در History → رفرش صفحه: ویدیو دیگر در دیتابیس نیست (`SELECT * FROM generator_generation_jobs WHERE id = ...` خالی) و فایل از باکت `user-videos` حذف شده.
- کلیک trash در Library روی یک «Final merged video»: فایل از باکت `merged-videos` پاک می‌شود (بدون تغییر، همین الان کار می‌کند).
