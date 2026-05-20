## هدف

Final Film فقط باید کارت‌های موجود در بخش Pending را merge کند و فایل خروجی را در preview نشان دهد. **هیچ کارت جدیدی** نباید در Pending، Library، یا History اضافه شود و کارت‌های منبع هم نباید مخفی/جابه‌جا شوند.

## رفتار فعلی (مشکل)

در `DashboardPage.tsx` تابع Final Film بعد از merge این کارها را انجام می‌دهد:

1. یک `JobDetail` با id `merged-...` می‌سازد (`entry`).
2. آن را به `mergedEntries` اضافه می‌کند و در localStorage پایدار می‌کند (`persistMerged`).
3. به‌صورت خودکار به `approvedIds` (Library) اضافه می‌کند.
4. کلیپ‌های منبع را در `projectSourceJobs[mergedId]` و `projectSourceImages[mergedId]` snapshot می‌گیرد.
5. کارت‌های منبع را در `workspaceHiddenJobIds` / `workspaceHiddenImageIds` پنهان می‌کند و از active manifest حذف می‌کند.
6. `resetWorkspace({ keepPreview: true })` صدا می‌زند → کل workspace ریست می‌شود.

نتیجه: کاربر یک «پروژه‌ی جدید» در Pending/Library می‌بیند و کلیپ‌های اصلی محو می‌شوند.

## تغییرات

فقط در `src/modules/generator-ui/pages/DashboardPage.tsx`، در بدنه‌ی Final Film (تقریباً خطوط ۲۹۵۶–۳۰۶۴):

1. **حذف ساخت و درج کارت merged**
   - حذف ساخت `entry: JobDetail` و فراخوانی `setMergedEntries(...)` + `persistMerged(...)`.
   - حذف `setApprovedIds(...)` و نوشتن در `approvedStorageKey`.
   - حذف `rememberClipRatio(mergedId, ...)`.

2. **حذف snapshot و مخفی‌سازی کلیپ‌های منبع**
   - حذف ساخت `sourceJobs`, `setProjectSourceJobs`, `persistProjectSourceJobs`.
   - حذف ساخت `sourceImages`, `setProjectSourceImages`, `persistProjectSourceImages`.
   - حذف `setWorkspaceHiddenJobIds(...)`, `persistWorkspaceHiddenJobIds(...)`, `unmarkActiveJobs(...)`.
   - حذف معادل image آن‌ها.

3. **حذف reset workspace**
   - حذف `resetWorkspace({ keepPreview: true })`. کارت‌های Pending دست‌نخورده باقی بمانند.

4. **نمایش فایل merged در preview بدون ساخت کارت**
   - پس از آپلود موفق و گرفتن `publicUrl`، یک state سبک محلی برای فایل خروجی نگه می‌داریم (مثلاً `lastMergedPreviewUrl: string | null`) و overlay/preview موجود را روی این URL مستقیم تنظیم می‌کنیم — بدون تولید id با پیشوند `merged-` و بدون درج در هیچ لیست.
   - اگر منطق فعلی preview صرفاً نیاز به URL دارد، از همان `publicUrl` استفاده می‌کنیم؛ نیاز به `JobDetail` صوری نیست.

5. **پاکسازی state در `finally`**
   - `setIsMerging(false)` و `setMergeProgress(0)` حفظ می‌شوند.
   - مطمئن می‌شویم در مسیر خطا یا موفقیت، هیچ نوشتن جدیدی در `mergedEntries`/`approvedIds`/`workspaceHiddenJobIds` رخ نمی‌دهد.

## نکات حفظ‌شده

- بررسی پیش‌از‌merge برای کلیپ‌های شکسته، single-card guard، آپلود به bucket `merged-videos`، timeout آپلود، refresh session، transitions، music/voiceover — همگی بدون تغییر.
- اعتبار فایل خروجی در storage تغییری نمی‌کند؛ فقط ثبت آن به‌عنوان «کارت» در UI حذف می‌شود.

## فایل‌های هدف

- `src/modules/generator-ui/pages/DashboardPage.tsx` (تنها فایل)

بدون تغییر دیتابیس، بدون تغییر backend، بدون migration.

## اعتبارسنجی

پس از پیاده‌سازی:
- اجرای Final Film روی ۴ کلیپ Pending → preview فایل merged پخش می‌شود، اما پنل Pending همچنان همان ۴ کارت قبلی را دارد، هیچ «Final merged video — N clips» در Library/Pending ظاهر نمی‌شود.
- localStorage کلید `merged-videos:<user>` دیگر رشد نمی‌کند.
- دکمه‌ی Final Film دوباره قابل استفاده است و progress به ۹۵→۹۶→۹۹→۰ می‌رسد.