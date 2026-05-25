## هدف
رفع ریشه‌ای خطای `video-edit extract frames failed: RuntimeError: memory access out of bounds` در مسیر Video-to-Video و بستن لوپ خرابی با retry/cleanup واقعی، نه فقط پیام خطا.

## چیزی که الان مشخص است
- خطا در **مرحله استخراج فریم** رخ می‌دهد، نه در UI.
- مسیر فعلی `editVideoWithAi.ts` از همان FFmpeg مشترک استفاده می‌کند که در بخش‌های دیگر هم استفاده می‌شود.
- طبق داک و issueهای upstream ffmpeg.wasm، `memory access out of bounds` معمولاً با این الگوها رخ می‌دهد:
  1. reuse کردن همان worker برای execهای متعدد
  2. استخراج فریم از ویدیوهای خاص/عمودی با ابعاد نسبتاً بزرگ
  3. باقی‌ماندن heap/FS آلوده بعد از یک exec ناموفق

## پلن اجرا
1. **ایزوله کردن FFmpeg برای Video-to-Video**
   - مسیر AI edit دیگر روی singleton مشترک تکیه نکند.
   - برای هر job یک FFmpeg تازه ساخته شود تا آلودگی heap از trim/transcode/edit به هم نشت نکند.

2. **کم‌مصرف کردن extraction path**
   - فرمان extraction را برای ویدیوهای عمودی/سنگین سبک‌تر می‌کنم:
     - محدود کردن ابعاد بر اساس هر دو محور، نه فقط عرض
     - محدود کردن تعداد فریم خروجی بر اساس `fps * maxDuration`
     - حذف streamهای غیرضروری برای decode سبک‌تر
   - هدف این است که worker قبل از edit اصلاً به مرز حافظه نرسد.

3. **retry ریشه‌ای در خود مرحله extract**
   - اگر extract شکست خورد:
     - worker کامل terminate/reset شود
     - extraction با preset سبک‌تر دوباره اجرا شود
   - این retry الان فقط برای encode وجود دارد؛ آن را به extract هم گسترش می‌دهم.

4. **cleanup واقعی بعد از هر attempt**
   - فایل‌های موقت و listenerها بعد از success/failure پاک شوند.
   - اگر attempt خراب شد، FS قبلی دوباره استفاده نشود.

5. **سخت‌کردن پیام خطا و fallback نهایی**
   - اگر حتی after-retry هم استخراج نشد، پیام نهایی کاربرپسند و دقیق باشد و مشخص کند مشکل از محدودیت engine مرورگر برای همان ویدیو است، نه prompt.

## جزئیات فنی
- فایل‌های درگیر:
  - `src/modules/generator-ui/lib/editVideoWithAi.ts`
  - `src/modules/generator-ui/lib/transcodeToMp4.ts`
  - در صورت نیاز، فقط برای نمایش بهتر خطا: `src/modules/generator-ui/components/VideoToVideoDialog.tsx`
- تغییرات اصلی:
  - اضافه کردن API برای گرفتن FFmpeg غیرمشترک یا job-scoped
  - extraction دو‌مرحله‌ای: normal -> low-memory retry
  - جلوگیری از reuse شدن instance خراب

## اعتبارسنجی
بعد از پیاده‌سازی این‌ها را تست می‌کنم:
1. ویدیوی عمودی مشابه اسکرین‌شات
2. یک ویدیوی افقی معمولی
3. اجرای دوباره پشت‌سرهم بدون refresh
4. بررسی اینکه خطا از extract به encode جابه‌جا نشده باشد

## خروجی مورد انتظار
- دیگر در بیشتر ویدیوهای عمودی/معمولی روی `extract frames` با `memory access out of bounds` نمی‌افتد.
- اگر engine مرورگر واقعاً به سقف محدودیت بخورد، مسیر retry خودکار اجرا می‌شود.
- اگر باز هم غیرقابل پردازش بود، خطا دقیق و قابل‌فهم می‌شود، بدون گیر کردن در وضعیت نیمه‌خراب.