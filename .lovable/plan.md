# چرا Library رفتارهای متناقض نشان می‌دهد

## تشخیص (شما درست می‌گویید)

کل وضعیت Library صرفاً در **localStorage مرورگر** ذخیره می‌شود، نه در دیتابیس. در `DashboardPage.tsx` این کلیدها استفاده می‌شوند:

- `merged-videos:${userId}` → کارت‌های Final Film
- `approved-videos:${userId}` → مجموعه IDهای approve‌شده
- `library-saved-jobs:${userId}` → snapshot تک‌کلیپ‌های ذخیره‌شده
- `draft-*:${userId}` → پروژه‌های Draft

نتیجه: Library = اشتراک این چند مجموعه که هیچ‌کدام در بک‌اند نگه‌داری نمی‌شوند.

## چرا روزهای مختلف نتایج مختلف می‌بیند

1. **مرورگر/دستگاه متفاوت** → localStorage جدا → Library خالی یا متفاوت.
2. **پاک شدن خودکار localStorage** توسط مرورگر (quota، حالت ناشناس، پاک‌سازی دوره‌ای، iOS Safari بعد از ۷ روز عدم استفاده).
3. **منطق Prune معیوب (خط 1325–1346):** اگر `mergedEntries` هنوز از localStorage هیدریت نشده باشد و `approvedIds` زودتر بیاید، حلقه prune تمام IDها را به‌عنوان "ناشناخته" حذف می‌کند و در localStorage بازنویسی می‌کند → کارت‌ها برای همیشه از Library محو می‌شوند.
4. **بک‌اند منبع حقیقت ندارد:** جداول `generator_jobs` و `generator_video_assets` نمی‌دانند کدام جاب «Final Film» یا «در Library» است. پس حتی اگر داده‌ها سالم باشند، بازسازی Library در مرورگر جدید ممکن نیست.

## راه‌حل ریشه‌ای (پیشنهادی)

### بک‌اند
1. افزودن ستون‌های وضعیتی به `generator_jobs`:
   - `is_final_film boolean default false`
   - `library_approved boolean default false`
   - `final_film_source_ids uuid[]` (برای کارت‌های merge)
   - `is_draft boolean default false` + `draft_snapshot jsonb`
2. مهاجرت یکباره: edge function که بر اساس localStorage کاربر (در اولین لاگین بعد از deploy) این ستون‌ها را پر کند — یا ساده‌تر، API‌های جدید برای علامت‌گذاری.
3. اضافه کردن endpoint‌ها در `job-orchestrator`:
   - `markLibraryApproved(jobId, value)`
   - `markFinalFilm(jobId, sourceIds)`
   - `listLibrary()` → فقط جاب‌هایی که `library_approved=true OR is_final_film=true OR is_draft=true`

### فرانت
4. در `DashboardPage`، به‌جای localStorage از endpointهای جدید استفاده شود. localStorage فقط به‌عنوان cache (نه منبع حقیقت).
5. حذف منطق prune مخرب فعلی، یا حداقل افزودن شرط «فقط وقتی mergedEntries هیدریت شد».
6. مهاجرت سازگار: در اولین mount، اگر localStorage داده دارد و بک‌اند ندارد → یکبار push کن، سپس از بک‌اند بخوان.

## محدوده تغییرات

- `supabase/migrations/*` (افزودن ستون‌ها + index)
- `supabase/functions/_shared/modules/job-orchestrator/{contract,service,gateway}.ts`
- `src/modules/job-orchestrator/{contract,api}.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx` (جایگزینی persistence)

## ریسک‌ها

- مهاجرت داده‌های فعلی کاربران: باید one-shot sync از localStorage به بک‌اند انجام شود تا کارت‌های موجودشان از بین نرود.
- حجم تغییرات در `DashboardPage` بالاست (چندین useEffect مربوط به localStorage باید بازنویسی شود).

## مرحله بعد

اگر تأیید کنید، کار را در دو فاز پیش می‌برم:
- **فاز ۱ (سریع):** فقط رفع باگ prune و افزودن guard هیدریشن — جلوی پاک شدن ناگهانی Library را می‌گیرد، اما همچنان وابسته به مرورگر می‌ماند.
- **فاز ۲ (ریشه‌ای):** انتقال کامل به بک‌اند طبق طرح بالا.

کدام را شروع کنم؟ یا هر دو پشت سر هم؟
