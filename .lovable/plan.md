## هدف

با کلیک روی هر کارت در پنل **Library** (هر "پروژه" / Final Film)، پنل **HISTORY** باید کارت‌های منبع همان پروژه (کلیپ‌هایی که برای ساختن آن فاینال فیلم استفاده شده‌اند) را نمایش دهد.

## وضعیت فعلی (مشکل)

در `handleMerge` (خطوط ۲۰۲۶–۲۰۴۹ در `DashboardPage.tsx`) بعد از ساخت Final Film، تمام جاب‌های منبع از سرور **به‌طور دائمی حذف** می‌شوند (`jobOrchestratorGateway.deleteJob`) و از state هم پاک می‌شوند. به همین دلیل بعد از merge هیچ راهی برای بازگرداندن کلیپ‌های منبع به History وجود ندارد. این با نیاز کاربر در تضاد مستقیم است.

## تغییرات پیشنهادی (فقط فرانت‌اند)

### ۱) ذخیره‌ی نگاشت پروژه → کلیپ‌های منبع
- یک state جدید: `projectSourceJobs: Record<mergedId, JobDetail[]>` که برای هر مدخل Library، یک snapshot کامل از کارت‌های منبع (همان `JobDetail` با `id`, `video.storage_path`, `input_prompt`, `created_at`, ...) را نگه می‌دارد.
- این map در `localStorage` با کلید `project-source-jobs:${userId}` ذخیره می‌شود تا بعد از refresh هم پایدار باشد.
- در زمان merge، قبل از هر گونه پاکسازی، snapshot کلیپ‌های واجد شرایط در این map ذخیره می‌شود.

### ۲) توقف حذف سروری منابع در `handleMerge`
- بلاک "Purge History sources from the server" حذف می‌شود (خطوط ۲۰۲۶–۲۰۵۰):
  - دیگر `jobOrchestratorGateway.deleteJob` برای منابع صدا زده نمی‌شود.
  - دیگر `generatorUiGateway.deleteUserImage` به‌صورت دسته‌جمعی صدا زده نمی‌شود.
- به‌جای پاکسازی، منابع به `workspaceHiddenJobIds` اضافه می‌شوند تا HISTORY در حالت عادی (وقتی هیچ پروژه‌ای انتخاب نشده) خالی بماند — دقیقاً همان رفتار "Start Over" که قبلاً پیاده شد.
- نتیجه: کلیپ‌های منبع هم در سرور و هم در state باقی می‌مانند ولی به‌صورت پیش‌فرض در HISTORY مخفی هستند.

### ۳) حالت "Selected Project" برای پنل HISTORY
- یک state جدید: `selectedProjectId: string | null`.
- وقتی کاربر روی یک کارت Library کلیک می‌کند (خط ~۳۲۱۴):
  - اگر آن کارت یک `merged-*` است → `selectedProjectId = video.id` و علاوه بر `setPreviewVideoId`، پنل HISTORY هم به‌حالت "filtered" می‌رود.
  - رفتار فعلی (تنظیم preview و بستن پنل) حفظ می‌شود.
- محاسبه‌ی `displayedVideos` (خطوط ۸۸۰–۹۲۷) به‌روزرسانی می‌شود:
  - اگر `selectedProjectId` ست شده باشد → فقط جاب‌هایی که `projectSourceJobs[selectedProjectId]` شامل آن‌هاست برگردانده شوند (بدون اعمال `workspaceHiddenJobIds`).
  - در غیر این‌صورت → رفتار فعلی (فیلتر با `workspaceHiddenJobIds`).
- شمارنده‌ی HISTORY هم همین `displayedVideos.length` را نشان می‌دهد (که از قبل اصلاح شده).

### ۴) UI پنل HISTORY در حالت Project Selected
- یک هدر کوچک بالای لیست HISTORY اضافه می‌شود که می‌گوید "Showing clips of: {project name}" به‌همراه یک دکمه‌ی **Clear** (آیکون ×) که `selectedProjectId = null` می‌کند و به نمای پیش‌فرض برمی‌گردد.
- وقتی کاربر **Start Over** می‌زند، `selectedProjectId` هم null می‌شود.
- وقتی کاربر روی کارت Library که `merged-*` نیست کلیک می‌کند (در حال حاضر چنین چیزی وجود ندارد ولی برای امنیت)، `selectedProjectId = null`.

### ۵) Hydration اولیه
- موقع mount، `projectSourceJobs` از localStorage خوانده می‌شود.
- کارت‌های مربوط به پروژه‌های قدیمی که قبل از این تغییر merge شدند، snapshot ندارند → برای آن‌ها کلیک روی Library فقط preview را عوض می‌کند (مثل قبل) و یک پیام کوچک "No source clips recorded for this older project" در HISTORY نشان داده می‌شود.

## نکات

- هیچ بک‌اند یا migration نیاز نیست؛ همه‌چیز در فرانت‌اند + localStorage است.
- کارت‌های Library هرگز حذف نمی‌شوند (طبق الزام قبلی کاربر).
- سورس فایل‌های ویدیویی در سرور باقی می‌مانند تا بازپخش در HISTORY در حالت Selected Project کار کند. این یک trade-off فضای ذخیره‌سازی برای حفظ تاریخچه‌ی پروژه است.

## فایل‌های تحت تأثیر

- `src/modules/generator-ui/pages/DashboardPage.tsx` (تنها فایل تغییریافته)

