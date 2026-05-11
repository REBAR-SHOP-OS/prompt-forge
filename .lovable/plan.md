## وضعیت فعلی

در دیتابیس:
- `generator_generation_jobs`: 82 ردیف soft-deleted (از 85 کل)
- `generator_video_assets`: 84 ردیف soft-deleted (از 87 کل)

این‌ها قبل از تغییر اخیر (که delete را hard کرد) به‌صورت soft-delete (`deleted_at = now()`) باقی مانده‌اند و فایل‌های ویدیویی‌شان همچنان روی Storage هستند.

## هدف

حذف کامل و دائمی همهٔ کارت‌ها/پروژه‌های قبلاً soft-deleted (هم ردیف‌های DB و هم فایل‌های Storage در bucketهای `user-videos`، `merged-videos`، `wan-frames`).

## تغییرات

### 1) Edge Function جدید: `supabase/functions/purge-deleted-assets/index.ts`
عملیات یک‌بار-مصرف برای کاربر احرازهویت‌شده:
- ورودی: درخواست POST از کاربر لاگین‌شده.
- مرحله A: همهٔ `generator_video_assets` با `deleted_at IS NOT NULL` و `user_id = auth.uid()` را با `storage_path`شان بخواند.
- مرحله B: storage_path هر asset را به `(bucket, key)` parse کند (با همان منطق `KNOWN_BUCKETS` در `gateway.ts` که `user-videos`, `merged-videos`, `wan-frames` را شامل می‌شود).
- مرحله C: فایل‌ها را گروه‌بندی‌شده per-bucket با `supabase.storage.from(bucket).remove([keys...])` با service-role key حذف کند.
- مرحله D: ردیف‌های `generator_video_assets` و `generator_generation_jobs` با `deleted_at IS NOT NULL` و متعلق به همان `user_id` را به‌صورت hard delete پاک کند.
- خروجی: `{ purgedJobs, purgedAssets, removedFiles, errors[] }`.

### 2) فراخوانی خودکار از Frontend
در `DashboardPage.tsx` یک‌بار در mount (پس از تأیید `userId`)، تابع را صدا بزند. برای جلوگیری از تکرار، یک flag در `localStorage` (مثلاً `generator:purged-soft-deletes:v1`) ذخیره شود. اگر flag وجود ندارد → فراخوانی → ست کردن flag.
این فراخوانی silent است (بدون UI)؛ خطاها در console لاگ شوند.

### 3) بدون تغییر Schema
`deleted_at` ستون باقی می‌ماند (برای سازگاری) ولی دیگر استفاده نمی‌شود — منطق فعلی هم hard-delete می‌کند.

## خارج از scope

- پاک‌سازی `generator_user_images` (سؤال کاربر فقط دربارهٔ کارت‌های ویدیو/پروژه‌هاست؛ تصاویر آپلودی جداگانه از مسیر خودشان hard-delete می‌شوند).
- تغییر در RLS، migration ساختاری، یا backend orchestrator.

## تأیید

پس از اجرا روی هر کاربر:
- `SELECT count(*) FROM generator_generation_jobs WHERE deleted_at IS NOT NULL` باید 0 باشد.
- فایل‌های متناظر در Storage در bucketهای ذکرشده پاک شوند.
- پروژه برای کاربر کاملاً تمیز باشد و در سشن‌های بعدی این purge دوباره اجرا نشود.
