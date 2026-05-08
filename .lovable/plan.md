# رفع باگ History — حذف واقعی و امن

## ریشه باگ

در `src/modules/generator-ui/pages/DashboardPage.tsx` یک مجموعهٔ محلی به نام `deletedIds` در `localStorage` با کلید `deleted-videos:<userId>` نگهداری می‌شود. دکمهٔ **Start Over** (خط ۱۸۳۹) و بخشی از مسیرهای پاکسازی، فقط آیتم‌ها را به این مجموعه اضافه می‌کنند و **هیچ تماسی با سرور نمی‌گیرند**. در نتیجه:

- روی همان مرورگر، آیتم‌ها مخفی می‌مانند.
- اما ردیف‌های `generator_generation_jobs`، `generator_video_assets` و `generator_user_images` و فایل‌های Storage همگی روی سرور **سالم باقی می‌مانند**.
- وقتی کاربر از مرورگر/دستگاه دیگری وارد می‌شود (یا کش پاک می‌شود، یا نسخهٔ Published را باز می‌کند)، API همه را بازمی‌گرداند و کارت‌ها دوباره ظاهر می‌شوند.

حذف تکی ویدیو از قبل سرور را صدا می‌زند (`jobOrchestratorGateway.deleteJob`)، اما حذف تکی تصویر فقط `deleted_at` را در DB ست می‌کند و **فایل Storage باقی می‌ماند**. Start Over هم هیچ‌کدام را پاک نمی‌کند.

## هدف

«Delete» در هر کارت و «Start Over» باید حذف واقعی، per-user و امن انجام دهند: هم ردیف DB (یا soft-delete با `deleted_at`) و هم فایل Storage. هیچ مخفی‌سازی صرفاً محلی باقی نماند.

## تغییرات

### ۱) Backend — حذف واقعی تصاویر کاربر

ایجاد RPC جدید `generator_delete_user_image(_user_id uuid, _image_id uuid) RETURNS text` که:
- مالکیت را چک می‌کند، وگرنه exception.
- `deleted_at = now()` ست می‌کند.
- مقدار `storage_path` را برمی‌گرداند تا edge function فایل را از باکت `user-images` حذف کند.

ایجاد edge function `images-delete` (با verify_jwt در کد، الگوی `jobs-delete`):
- ورودی: `{ imageId: uuid }`.
- JWT را authenticate می‌کند.
- RPC بالا را با service-role می‌زند، سپس فایل برگشتی را با service client از `user-images` حذف می‌کند.
- بازگشت: `{ ok: true, requestId }`.

افزودن متد `deleteUserImage(imageId)` به `src/modules/generator-ui/gateway.ts` (یا یک ماژول مناسب) که این endpoint را صدا می‌زند.

### ۲) Backend — تقویت `generator_delete_job` و `jobs-delete`

تابع DB از قبل soft-delete می‌کند و مسیرهای Storage را برمی‌گرداند؛ مطمئن می‌شویم edge function `jobs-delete` فایل‌ها را از باکت‌های مربوطه حذف می‌کند (در صورت کمبود، اضافه می‌شود). تغییر سطح schema لازم نیست.

### ۳) Frontend — `DashboardPage.tsx`

- حذف کامل سیستم `deletedIds` + `deletedStorageKey` + `persistDeleted` و همهٔ فیلترهای `!deletedIds.has(...)`. منبع حقیقت برای نمایش، نتیجهٔ سرور است که از قبل با `deleted_at IS NULL` فیلتر می‌شود.
- `handleDeleteVideo`: همان مسیر فعلی سرور (`jobOrchestratorGateway.deleteJob`)؛ فقط بدون افزودن به `deletedIds` — بلکه آیتم را پس از موفقیت از state جاری حذف می‌کند و در صورت خطا rollback می‌کند.
- `handleDeleteUserImage`: به‌جای آپدیت مستقیم Supabase، edge function جدید `images-delete` صدا زده شود تا هم DB و هم Storage پاک شوند؛ optimistic update با rollback روی خطا.
- `handleStartOver`:
  - دیالوگ تأیید فعلی حفظ شود (متن به‌روز شود: «این عمل دائمی است و قابل بازگشت نیست»).
  - برای هر `generatedVideo` غیر-merged → `deleteJob(id)` به‌صورت موازی با `Promise.allSettled`.
  - برای هر `mergedEntry` → حذف فایل از باکت `merged-videos` (مسیر فعلی).
  - برای هر `userImage` → `deleteUserImage(id)` با `Promise.allSettled`.
  - پس از پایان: `setGeneratedVideos([])`, `setUserImages([])`, `setMergedEntries([])`, `setApprovedIds(new Set())`, `setTransitions({})`, `setManualOrder(null)` و پاک‌سازی کلیدهای localStorage مرتبط (approved, merged, transitions, pendingEnd/Start, deleted).
  - در صورت خطای جزئی، پیام خلاصه به کاربر نشان داده شود اما رفرش لیست از سرور هم اجرا شود تا UI با وضعیت واقعی هم‌سو شود.
- پاک‌سازی کلید `deleted-videos:<userId>` از localStorage در mount (مهاجرت یک‌بارهٔ کاربران فعلی).

### ۴) امنیت

- همهٔ مسیرهای حذف از طریق RPC با `SECURITY DEFINER` و چک `user_id = auth.uid()` (یا چک صریح در RPC) انجام می‌شود.
- حذف Storage فقط در edge function با service-role و پس از اعتبارسنجی مالکیت و JWT.
- RLS موجود (`videos: deny client delete`, `jobs: deny client delete`) دست‌نخورده می‌ماند؛ کلاینت هرگز مستقیم حذف نمی‌کند.
- ورودی‌ها با Zod اعتبارسنجی می‌شوند.

## خارج از دامنه

- بدون تغییر در schema جداول (فقط افزودن یک تابع DB جدید).
- بدون تغییر در policy‌های RLS.
- بدون تغییر در صفحات auth یا بخش‌های دیگر اپ.

## بعد از پیاده‌سازی

کاربر باید **Publish → Update** را بزند تا نسخهٔ منتشر شده هم به‌روز شود. پس از آن، Delete و Start Over روی همهٔ دستگاه‌ها دائمی و امن خواهند بود.
