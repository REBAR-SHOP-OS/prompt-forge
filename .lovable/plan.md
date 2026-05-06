# خواسته
خروجی دانلود ادغام کارت‌ها باید **MP4** باشه (نه webm) و صدا هم داشته باشه. این یک قانون الزامی است.

# مشکل
- `MediaRecorder` در اکثر مرورگرها فقط `webm` تولید می‌کنه، نه `mp4` واقعی.
- روش فعلی (canvas + MediaRecorder) صدا رو هم drop می‌کنه.
- صرفاً عوض کردن پسوند یا `contentType` به `mp4` فایل رو معتبر نمی‌کنه.

# راه‌حل: ffmpeg.wasm
استفاده از `@ffmpeg/ffmpeg` (نسخه 0.12) برای ادغام واقعی در مرورگر. خروجی: MP4 با ویدیو H.264 و صدای AAC.

## مراحل
1. **نصب پکیج‌ها** (انجام شد): `@ffmpeg/ffmpeg`, `@ffmpeg/util`
2. **بازنویسی `src/modules/generator-ui/lib/mergeVideos.ts`**:
   - بارگذاری lazy ffmpeg core از CDN (`unpkg`) با `toBlobURL` (لازم برای SharedArrayBuffer-less mode)
   - برای هر کلیپ ورودی: دانلود → نرمال‌سازی به MP4 یکنواخت (H.264, yuv420p, 30fps, ابعاد زوج، AAC stereo 48kHz) — concat demuxer به استریم‌های هماهنگ نیاز داره
   - برای کلیپ‌های بدون audio track، تولید audio خاموش با `anullsrc` تا concat به‌هم نریزه
   - مرحله نهایی: `concat demuxer` با `-c copy` (بدون re-encode دوم — سریع و بدون افت کیفیت)
   - خروجی `Blob` با `type: 'video/mp4'`
   - حفظ امضای تابع و callback پیشرفت بدون تغییر
3. **به‌روزرسانی `src/modules/generator-ui/pages/DashboardPage.tsx`** در سه نقطه:
   - خط ~1057: `merged-${Date.now()}.mp4` به جای `.webm`
   - خط ~1061: `contentType: 'video/mp4'`
   - خطوط ~600 و ~666 (مسیر prepend/append استیل): همان تغییرات (پسوند `.mp4` و contentType)
   - خطوط ~608 و ~675: نام فایل خروجی merge با پسوند `.mp4`

## ملاحظات فنی
- **اندازه bundle**: ffmpeg core ~25MB از CDN لود می‌شه (یک‌بار، cached). lazy load در زمان اولین merge انجام می‌شه تا startup app کند نشه.
- **عملکرد**: نرمال‌سازی هر کلیپ با `-preset ultrafast` تا تأخیر مرورگر حداقل بمونه.
- **سازگاری**: ffmpeg.wasm 0.12 در همه مرورگرهای مدرن کار می‌کنه (نسخه single-thread، بدون نیاز به COOP/COEP headers).
- **پیشرفت UI**: 85% پیشرفت برای transcode هر کلیپ، 15% آخر برای concat — تجربه bar روان می‌مونه.

## تضمین رفتار
- ظاهر دکمه merge، آیکون، و UX دانلود هیچ تغییری نمی‌کنه
- منطق مسیرهای دیگر (text-to-video، i2v، prepend/append استیل) دست‌نخورده باقی می‌مونه — فقط فرمت میانی و خروجی mp4 می‌شه
- صدای کلیپ‌های اصلی در خروجی نهایی حفظ می‌شه

## فایل‌های تحت تأثیر
- `src/modules/generator-ui/lib/mergeVideos.ts` (بازنویسی کامل)
- `src/modules/generator-ui/pages/DashboardPage.tsx` (تغییر پسوند و contentType در ۴-۵ نقطه)
- `package.json` (پکیج‌ها قبلاً اضافه شدن)
