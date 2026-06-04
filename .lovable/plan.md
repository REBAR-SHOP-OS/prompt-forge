## هدف
حل ریشه‌ای جداسازی دسته‌ها: «Final videos» فقط خروجی دکمهٔ **Final Film**، و «Drafts» بقیه. یک پروژهٔ درفت فقط هنگام فاینال‌شدن باید به دستهٔ فاینال منتقل شود و دیگر در Drafts دیده نشود — حتی بعد از رفرش، پاک‌شدن کش، یا ورود از مرورگر دیگر.

## علت ریشه‌ای (تشخیص)
- فاینال‌فیلم به‌صورت کلاینت ساخته و در باکت `merged-videos` آپلود می‌شود، اما **هیچ رکوردی در دیتابیس** برای آن ساخته نمی‌شود.
- دسته‌بندی UI کاملاً به localStorage وابسته است: `finalizedItems` از `mergedEntries`+`approvedIds` و `draftItems` از `draftEntries`.
- منطق «backfill» (خط ~2207 `DashboardPage.tsx`) هر کلیپ کامل بی‌صاحب را به‌عنوان یک draft تکی می‌سازد. اگر رکورد فاینال در localStorage از بین برود، کلیپ‌های سازنده دوباره به Drafts برمی‌گردند و کاربر «فاینال‌ها را در درفت» می‌بیند.
- هنگام فاینال‌شدن فقط draft فعال حذف می‌شود (خط ~4630)، نه همهٔ درفت‌های متناظر با کلیپ‌های منبع.

## راهکار: ثبت دائمی فاینال‌فیلم در بک‌اند

### ۱. مهاجرت دیتابیس
- افزودن ستون `parent_final_job_id uuid NULL` (با ایندکس) به `generator_generation_jobs` برای علامت‌گذاری کلیپ‌هایی که منبع یک فاینال شده‌اند.
- ساخت تابع/RPC `generator_finalize_film` که:
  - یک ردیف job با `status='completed'`, `provider_key='final-film'`, `model_key='merge'`, `input_prompt` و `requested_aspect_ratio` می‌سازد.
  - یک ردیف `generator_video_assets` با `storage_path` فایل merge‌شده، `aspect_ratio` و `duration` ثبت می‌کند.
  - `parent_final_job_id` تمام job idهای کلیپ‌های منبع را روی job فاینال جدید ست می‌کند.
  - id فاینال را برمی‌گرداند.
- همهٔ GRANTها مطابق الگوی پروژه (authenticated/service_role) اضافه می‌شود.

### ۲. اج‌فانکشن
- `jobs-finalize` جدید (یا توسعهٔ `jobs-create-from-upload`) که RPC بالا را با احراز هویت کاربر فراخوانی می‌کند و ورودی‌اش: `storagePath`, `aspectRatio`, `duration`, `clipCount`, `sourceJobIds[]`.

### ۳. لایهٔ گیت‌وی/کلاینت
- افزودن متد `finalizeFilm(...)` به `job-orchestrator` gateway و contract سمت کلاینت.

### ۴. `DashboardPage.tsx`
- بعد از آپلود موفق فایل فاینال (خط ~4503)، علاوه بر مسیر فعلی localStorage، `finalizeFilm` را صدا بزن تا رکورد دائمی ساخته شود.
- **منبع حقیقت دسته‌بندی** سرور-محور شود:
  - `finalizedItems` = job‌هایی از `generatedVideos` که `provider_key==='final-film'` هستند (به‌علاوهٔ `mergedEntries` به‌عنوان کش سریع/بدون تکرار).
  - منطق backfill درفت: هر کلیپ که `parent_final_job_id` غیرتهی دارد یا `provider_key==='final-film'` است، **هرگز** draft نشود (در شروط خطوط ~2231 و فیلتر `draftItems` اضافه شود).
  - هنگام فاینال‌شدن، تمام درفت‌های متناظر با `sourceJobIds` (نه فقط draft فعال) از `draftEntries` حذف و tombstone شوند.
- حذف کارت فاینال هم رکورد سرور را پاک کند (هم‌راستا با مسیر حذف موجود).

## معیار پذیرش
- ساخت Final Film → کارت در «Final videos» و حذف کلیپ‌های منبع از «Drafts».
- رفرش / پاک‌کردن کش / مرورگر دیگر → فاینال همچنان در «Final videos» می‌ماند و در «Drafts» تکرار نمی‌شود.
- کلیپ تکی یا ویدئوی آپلودی بدون فاینال‌شدن → در «Drafts» باقی می‌ماند.

## فایل‌های متأثر
- مهاجرت SQL جدید
- `supabase/functions/jobs-finalize/index.ts` (جدید)
- `supabase/functions/_shared/modules/job-orchestrator/{contract,service}.ts`
- `src/modules/job-orchestrator/{contract,gateway}.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx`