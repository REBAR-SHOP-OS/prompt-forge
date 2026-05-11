## هدف
کارت‌هایی که در «Library / Your library» (ویدیوهای Approved و Final Film) ذخیره شده‌اند نباید با ورود/رفرش صفحه پاک شوند. فقط با کلیک روی آیکن سطل‌آشغال هر کارت (که از قبل وجود دارد و `deleteCard` را صدا می‌زند) باید برای همیشه حذف شوند.

## مشکل فعلی
در تغییر قبلی، برای اینکه workspace در هر ورود خالی باز شود، state های زیر هم در `useEffect` با مقدار خالی reset می‌شدند و دیگر از localStorage hydrate نمی‌شدند:

- `approvedIds` (آیدی کارت‌های ذخیره‌شده در Library)
- `mergedEntries` (کارت‌های Final Film که با merge ساخته شده‌اند)
- `projectSourceJobs` (snapshot کلیپ‌های منبع هر Final Film برای نمایش در HISTORY)
- `editedJobIds` (لیست کلیپ‌هایی که edit شده‌اند، برای merge بعد از refresh)

نتیجه: Library همیشه خالی نشان داده می‌شود — حتی اگر در localStorage داده وجود داشته باشد.

این چهار state دقیقاً همان چیزی هستند که Library را تشکیل می‌دهند. باید برای آن‌ها hydration از localStorage برگردد.

## تغییرات (همگی در `src/modules/generator-ui/pages/DashboardPage.tsx`)

### ۱) hydrate کردن `approvedIds` از localStorage (حدود خط ۴۵۰)
به‌جای همیشه `setApprovedIds(new Set())`، اگر `approvedStorageKey` ست باشد JSON را بخوان و Set بساز. در صورت خطا یا نبود کلید، Set خالی.

### ۲) hydrate کردن `mergedEntries` از localStorage (حدود خط ۶۹۴)
به‌جای همیشه `setMergedEntries([])`، اگر `mergedStorageKey` ست باشد JSON را parse کن و `setMergedEntries(parsed)` کن. در صورت خطا، آرایه خالی.

### ۳) hydrate کردن `projectSourceJobs` از localStorage (حدود خط ۵۲۷)
لازم تا وقتی کاربر روی کارت Library کلیک می‌کند، کلیپ‌های منبع آن پروژه در HISTORY نمایش داده شوند.

### ۴) hydrate کردن `editedJobIds` از localStorage (حدود خط ۴۹۱)
لازم برای اینکه Final Film پس از refresh بداند کدام کلیپ‌ها edit شده‌اند.

### آنچه تغییر نمی‌کند (workspace همچنان خالی شروع می‌شود)
- `workspaceHiddenJobIds` → خالی روی mount (workspace cleanup)
- `pendingEndAppends` / `pendingStartPrepends` → خالی روی mount
- `generatedVideos`, `userImages`, `previewVideoId`, `selectedProjectId`, `promptText`, music/voiceover state → بدون تغییر (همان رفتار خالی فعلی)

### تأیید رفتار حذف
`deleteCard` از قبل در همان فایل کارت را از `mergedEntries`، `approvedIds`، `projectSourceJobs` و در صورت لزوم سرور پاک می‌کند و در localStorage هم persist می‌کند. پس کلیک روی سطل‌آشغال = حذف دائمی. هیچ تغییری در آن لازم نیست.

## نتیجه
- ورود به `/app` → workspace خالی و آماده کار (بدون تغییر نسبت به الان).
- باز کردن Library → همه کارت‌های قبلاً ذخیره/Final Film شده پابرجا.
- تنها راه حذف: آیکن سطل‌آشغال روی هر کارت.
