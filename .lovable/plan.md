# رفع باگ: آپلود ویدیو/تصویر داخل پروژه‌ی فعلی بماند

## مشکل

وقتی کاربر یک پروژه‌ی درفت یا فاینال‌شده باز کرده (`selectedProjectId` ست است و هدر می‌گوید "Showing Project") و یک ویدیو/تصویر آپلود می‌کند، کارت جدید وارد همان پروژه نمی‌شود؛ یک «پروژه‌ی جدید» ساخته می‌شود.

## ریشه (Root Cause)

در `src/modules/generator-ui/pages/DashboardPage.tsx`، تابع `resumeSelectedProject` (خط ۲۸۹۷) فقط حالت **پروژه‌ی فاینال‌شده** را پشتیبانی می‌کند:

```ts
const snapshot = projectSourceJobs[selectedProjectId] ?? []   // فقط فاینال‌ها
```

برای درفت‌ها (`selectedProjectId` که با `draft-` شروع می‌شود) snapshot از `draftSourceJobs` خوانده نمی‌شود و `activeDraftId` هم به آن درفت ست نمی‌شود. در نتیجه:

1. `resumeSelectedProject` بدون restore کردن کلیپ‌های درفت فعلی، `selectedProjectId` را null می‌کند.
2. آپلود وارد `generatedVideos` می‌شود، ولی بدون دیدن سایر کلیپ‌های درفت.
3. effect خط ۱۶۹۲ که snapshot درفت را می‌سازد، چون `activeDraftId` فعلی همان درفت قبلی نیست (یا null است)، یک **درفت تازه** می‌سازد که فقط شامل کارت جدید (و کلیپ‌های قبلی که حالا visible شده‌اند) است — این همان «پروژه‌ی جدید» است که کاربر می‌بیند.

همین مسئله برای آپلود تصویر در `handleUploadImageFile` (خط ۲۴۰۳) و برای ارسال یک prompt جدید (`handleSubmit` خط ۲۹۵۲) هم وجود دارد، ولی برای کاربر مشکل تنها در آپلود گزارش شده است — راه حل پایه‌ای باید همه را پوشش دهد، چون منبع باگ همان تابع است.

## تغییرات

**فایل:** `src/modules/generator-ui/pages/DashboardPage.tsx`

### اصلاح `resumeSelectedProject` (حدود خط ۲۸۹۷–۲۹۱۲)

تابع را طوری بازنویسی می‌کنیم که هر دو حالت را پوشش دهد:

1. **اگر `selectedProjectId` با `draft-` شروع می‌شود (درفت فعال):**
   - snapshot را از `draftSourceJobs[id]` و `draftSourceImages[id]` بخوان.
   - کلیپ‌ها/تصاویر را با `mergeJob` / `mergeImage` به `generatedVideos` / `userImages` برگردان (در صورت لازم).
   - از `workspaceHiddenJobIds` / `workspaceHiddenImageIds` پاک نشوند (همان روش پروژه‌ی فاینال).
   - `setActiveDraftId(selectedProjectId)` و `persistActiveDraftId(selectedProjectId)` تا effect snapshot روی **همین** درفت کار کند و کارت جدید به آن اضافه شود.
   - سپس `setSelectedProjectId(null)`.

2. **اگر `selectedProjectId` پروژه‌ی فاینال است (مسیر فعلی):**
   - رفتار فعلی حفظ شود — به اضافه‌ی اینکه چون درفتی برای این پروژه وجود ندارد، `activeDraftId` به null ست شود تا effect یک درفت **تازه** بسازد (که در واقع همان رفتار «گسترش پروژه‌ی فاینال‌شده در یک درفت تازه» است که الان هم انجام می‌شود).

3. هیچ تغییری در `handleUploadVideoFile`، `handleUploadImageFile` و `handleSubmit` لازم نیست؛ همه قبلاً `resumeSelectedProject()` را صدا می‌زنند.

## اعتبارسنجی

1. یک درفت با دو کلیپ بساز، آن را از Library باز کن (هدر می‌گوید "Showing Project").
2. یک ویدیو آپلود کن.  
   **انتظار:** کارت جدید در همان پروژه ظاهر شود، نه به‌عنوان پروژه‌ی جدید در sidebar/Library.
3. دوباره Library را بررسی کن — فقط یک درفت با ۳ کلیپ باید وجود داشته باشد.
4. همین تست را برای آپلود تصویر و ارسال prompt جدید تکرار کن.
5. سپس یک پروژه‌ی فاینال‌شده را باز کن، آپلود کن — رفتار قبلی (extending با درفت تازه) دست‌نخورده باشد.

## نکات

- فقط منطق فرانت‌اند؛ دیتابیس و edge functionها بدون تغییر.
- منطق فیلتر `displayedVideos` / `visibleUserImages` که در اصلاح قبلی اضافه شد دست‌نخورده می‌ماند و درست با این فیکس همکاری می‌کند، چون `activeDraftId` به درفت درست ست می‌شود.
