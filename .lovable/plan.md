## مشکل (Root Cause)

در `src/modules/generator-ui/pages/DashboardPage.tsx` (خطوط ۲۲۶۴–۲۳۴۲) یک افکت در زمان mount اجرا می‌شود که:

1. **هیچ‌گاه** کارت‌های `generatedVideos` (ستون Pending / SHOWING PROJECT) و `userImages` را از بک‌اند دوباره بارگذاری نمی‌کند.
2. در عوض هر job/image ای را که در `activeJobIds` / `projectSourceJobs` / `draftSourceJobs` / `librarySavedJobs` لوکال‌استوریج پیدا نشود، **به‌صورت دائمی از بک‌اند پاک می‌کند** (`jobOrchestratorGateway.deleteJob` و `generatorUiGateway.deleteUserImage`).

نتیجه:
- بعد از Refresh ستون **Pending** خالی می‌شود چون `generatedVideos` همیشه با `[]` شروع می‌شود و هرگز هیدریت نمی‌شود.
- اگر کلید localStorage یک مرورگر/تب تمیز شود یا با تأخیر هیدریت شود، کارت‌های Library / Drafts / منابع پروژه به‌صورت دائمی از دیتابیس حذف می‌شوند و قابل بازیابی نیستند.

این دقیقاً برخلاف خواسته کاربر است: «تنها وقتی خودِ یوزر پروژه را حذف کند باید از مموری حذف شود».

## راه‌حل (یک مسیر تمیز و تک‌خطی)

افکت هیدریشن را به یک **بازیابی غیرمخرّب (read-only restore)** تبدیل می‌کنیم، بدون افزودن endpoint جدید، بدون تغییر بک‌اند، بدون تغییر UI.

### تغییرات در `src/modules/generator-ui/pages/DashboardPage.tsx`

بازنویسی بلوک خطوط ۲۲۶۴–۲۳۴۲ (`hydrationRanRef` effect):

1. حذف کامل منطقِ «orphan delete» (هر دو `jobOrchestratorGateway.deleteJob` و `generatorUiGateway.deleteUserImage` در این افکت).
2. به‌جای آن، پس از فراخوانی `listMyJobs()` و `select id from generator_user_images`:
   - برای هر `summary` که در `workspaceHiddenJobIds` نباشد، `jobOrchestratorGateway.getJob(id)` را موازی فراخوانی کرده و نتیجه را با `mergeJob` به `generatedVideos` اضافه کن (همان الگوی `hydrateJobs` موجود در خط ۳۷۶).
   - برای تصاویر، ردیف‌های کامل را با `select id, storage_path, created_at, still_duration_seconds, width, height` بخوان و آن‌هایی که در `workspaceHiddenImageIds` نیستند را در `setUserImages` بریز.
3. کامنت «MANDATORY RULE: Pending is NOT a history view» به همراه منطق پاکسازی حذف می‌شود؛ ستون Pending از این پس از روی workspace persisted (همان `activeJobIds` و `workspaceHiddenJobIds` که از قبل در localStorage هستند) و داده‌های بازیابی‌شده از بک‌اند ساخته می‌شود.
4. حذف فقط زمانی اتفاق می‌افتد که کاربر روی Trash یک کارت کلیک کند (مسیر موجود `handleDeleteClip` / `handleDeleteProject` که `workspaceHiddenJobIds` + `jobOrchestratorGateway.deleteJob` را فراخوانی می‌کنند — دست‌نخورده باقی می‌مانند).

### نتیجه پس از اعمال

- **Library → Final Videos / Drafts**: همان localStorage فعلی + پشتیبان بک‌اند (چون دیگر هیچ‌چیز silently حذف نمی‌شود).
- **ستون Pending (SHOWING PROJECT)**: بعد از Refresh دقیقاً همان کارت‌هایی که قبل از رفرش بودند بازیابی می‌شوند.
- **حذف کارت/پروژه** فقط با اقدام صریح کاربر (دکمه trash) انجام می‌شود — مطابق خواسته.

## فایل‌های تغییرکننده

- `src/modules/generator-ui/pages/DashboardPage.tsx` — فقط بلوک ۲۲۶۴–۲۳۴۲ بازنویسی می‌شود.

## ریسک

- چون منطقِ پاک‌کردن jobهای واقعاً رهاشده (مثلاً اگر کاربر در گذشته localStorage را پاک کرده باشد و jobهای قدیمی در DB مانده باشند) برداشته می‌شود، ممکن است در دفعه اول، چند کارت قدیمی هم در Pending ظاهر شوند. این دقیقاً همان رفتاری است که کاربر خواسته («تا وقتی خودش حذف نکند نباید از مموری برود»). کاربر می‌تواند با دکمه Trash هر کارتی را که نمی‌خواهد پاک کند.
- هیچ تغییری در RLS، migration، یا قراردادهای gateway لازم نیست.

## چک‌لیست تست

1. چند Job بساز تا در Pending ظاهر شوند → Refresh کن → باید همه دوباره ظاهر شوند.
2. یک پروژه را Final Film کن → در Library/Final Videos ذخیره شود → Refresh → باقی بماند.
3. روی Trash یک کارت کلیک کن → باید حذف شود → Refresh → بازنگردد.
4. Start Over بزن → کارت‌ها از Pending به Library/Hidden منتقل شوند (رفتار موجود) → Refresh → Library سالم بماند.