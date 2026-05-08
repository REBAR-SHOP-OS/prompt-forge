## هدف
وقتی کاربر روی یک کارت Trim/Edit انجام می‌دهد و Apply changes را می‌زند، همان نسخهٔ ادیت‌شده باید منبع قطعی کارت شود؛ سپس Final Film باید دقیقاً همان نسخه‌های ادیت‌شده را به هم متصل کند، نه فایل‌های اصلی را.

## ریشهٔ مشکل
در کد فعلی Apply changes بیشتر در state مرورگر و URL محلی نگه داشته می‌شود و فقط `storage_path` کارت در UI عوض می‌شود. اما رکورد واقعی asset در backend آپدیت نمی‌شود. بنابراین بعد از refresh، purge، hydrate، یا بعضی مسیرهای merge، Final Film ممکن است دوباره فایل اصلی کارت را بگیرد یا ادیت را پایدار و قطعی نداند.

## برنامهٔ اصلاح
1. **ثبت نسخهٔ ادیت‌شده به‌عنوان asset واقعی کارت**
   - یک backend function کوچک اضافه می‌شود که پس از آپلود فایل Trim شده، asset قبلی همان job را soft-delete کند و asset جدید را برای همان job ثبت کند.
   - خروجی function همان `JobDetail` کامل باشد تا UI کارت را از منبع معتبر backend جایگزین کند.

2. **تغییر Apply changes از local-only به persisted-source**
   - `applyTrimToCard` بعد از ساخت blob ادیت‌شده:
     - فایل را در bucket `merged-videos` آپلود کند.
     - function جدید را صدا بزند تا backend واقعاً `storage_path` کارت را به نسخهٔ ادیت‌شده تغییر دهد.
     - کارت را با `JobDetail` برگشتی merge کند.
   - اگر ثبت backend شکست خورد، پیام خطا نشان داده شود و کارت به‌عنوان «اعمال‌شده برای Final Film» علامت نخورد.

3. **ساده‌سازی منبع Final Film**
   - Final Film برای هر کارت فقط `job.video.storage_path` فعلی را استفاده کند، چون بعد از اصلاح، این مسیر خودش نسخهٔ ادیت‌شدهٔ واقعی است.
   - همچنان برای UX فعلی می‌توان URL محلی را برای نمایش فوری نگه داشت، اما منبع merge باید public/proxied URL پایدار کارت باشد.

4. **حفظ منطق انتخاب کارت‌های ادیت‌شده**
   - اگر کاربر چند کارت را Apply کرده، Final Film همان کارت‌های ادیت‌شده را در order فعلی به هم وصل کند.
   - کارت‌های image مثل قبل در زنجیره باقی بمانند.

5. **اعتبارسنجی**
   - مسیر را با سیگنال‌های کد بررسی می‌کنم: Apply changes باید job detail جدید برگرداند، History همان فایل جدید را نمایش دهد، و Final Film همان `storage_path` جدید را merge کند.
   - این تغییر فقط مسیر Edit/Apply/Final Film را دست می‌زند و منطق تولید و آپلود کارت جدید را تغییر نمی‌دهد.

## فایل‌های درگیر
- `supabase/functions/jobs-update-edited-video/index.ts` یا نام مشابه برای ثبت asset ادیت‌شده
- `src/modules/job-orchestrator/gateway.ts` برای متد جدید
- `src/modules/generator-ui/pages/DashboardPage.tsx` برای اصلاح `applyTrimToCard` و منبع merge

## نتیجهٔ مورد انتظار
بعد از Apply changes، کارت واقعاً به نسخهٔ ادیت‌شده تبدیل می‌شود؛ Final Film هم نسخه‌های ادیت‌شده را در فایل نهایی نشان می‌دهد، نه کلیپ‌های اصلی را.