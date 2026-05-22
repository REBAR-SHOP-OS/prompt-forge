## هدف نهایی
Final Film باید برای پروژه‌های طولانی مثل کلیپ ۲:۰۴ بدون توقف روی ۹۵٪ کامل شود و فایل نهایی در Library ذخیره شود. اگر مرورگر واقعاً نتواند منبعی را decode/record کند، باید با خطای دقیق متوقف شود؛ نه اینکه بی‌نهایت روی Encoding بماند.

## تشخیص فعلی
- UI روی `Encoding 95%` می‌ماند چون بعد از ضبط، مسیر هنوز وارد `ensureMp4` و `ffmpeg.wasm` می‌شود.
- حتی با `Promise.race` و fallback، خود ffmpeg واقعاً لغو نمی‌شود و ممکن است در پس‌زمینه CPU/RAM را درگیر کند؛ پس مشکل از ریشه حذف نشده.
- در `DashboardPage.tsx` حتی قبل از merge، `preloadMp4Transcoder()` اجرا می‌شود؛ یعنی هسته‌ی سنگین ffmpeg همچنان برای Final Film فعال می‌شود.
- برای هدف اصلی کاربر، «اتفاق افتادن Final Film» مهم‌تر از اجبار به MP4 است. خروجی WebM مرورگر سریع‌تر، پایدارتر و قابل آپلود/پخش در خود اپ است.

## برنامه اصلاح
1. **حذف کامل گلوگاه ۹۵٪ از مسیر پیش‌فرض**
   - در `mergeVideos.ts` خروجی recorder را بعد از finalizing مستقیماً برگردانم.
   - `ensureMp4` دیگر در مسیر عادی Final Film فراخوانی نشود.
   - خروجی پیش‌فرض Final Film برای پایداری `webm` باشد تا upload و Library حتماً انجام شود.

2. **حذف preload سنگین ffmpeg**
   - در `DashboardPage.tsx` فراخوانی `preloadMp4Transcoder()` را از شروع Final Film حذف کنم.
   - این باعث می‌شود کلیپ‌های طولانی وارد مرحله‌ی Encoding 95% نشوند.

3. **اصلاح progress واقعی**
   - بعد از ضبط، مرحله از `finalizing` مستقیم به `uploading` برود.
   - دیگر `Encoding 95%` برای مسیر پیش‌فرض نمایش داده نشود.
   - درصدها به شکل پایدار باشند: recording تا 94، finalizing کوتاه، uploading 99، done 100.

4. **حفظ امکان MP4 به‌صورت امن و غیرمسدودکننده**
   - فایل `transcodeToMp4.ts` را نگه می‌دارم برای جاهایی که کاربر دستی دانلود MP4 می‌خواهد.
   - اگر در بخش دیگری مثل download دستی از `ensureMp4` استفاده می‌شود، آن مسیر جدا باقی می‌ماند و Final Film را قفل نمی‌کند.

5. **پاکسازی و جلوگیری از اجرای پس‌زمینه**
   - چون ffmpeg دیگر در Final Film شروع نمی‌شود، دیگر transcoder پس‌زمینه‌ای وجود ندارد که بعد از timeout مرورگر را قفل کند.
   - cleanup موجود برای media tracks، audio context و video elements حفظ می‌شود.

## فایل‌های هدف
- `src/modules/generator-ui/lib/mergeVideos.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx`
- در صورت نیاز فقط اصلاح توضیحات/کامنت‌های `src/modules/generator-ui/lib/transcodeToMp4.ts` بدون تغییر در client/types خودکار.

## اعتبارسنجی بعد از اجرا
- مسیر کد دیگر هیچ import یا call اجباری به `ensureMp4` در Final Film ندارد.
- دکمه Final Film دیگر نباید در حالت `Encoding 95%` بماند.
- خروجی با extension و content type درست (`webm`) آپلود و در Library ثبت می‌شود.
- مسیر download MP4 دستی، اگر وجود داشته باشد، جدا از Final Film باقی می‌ماند.