## هدف
رفع ریشه‌ای خطای Video-to-Video تا دیالوگ روی `Preparing… 0%` گیر نکند و `ffmpeg` در محیط Vite به‌صورت پایدار لود شود.

## مشکل دقیق
بررسی کد، لاگ و شبکه نشان داد:
- `ffmpeg-core.js` و `ffmpeg-core.wasm` از مرورگر با `200` لود می‌شوند، پس مشکل فقط «نبودن فایل» نیست.
- خطا در مرحله‌ی `ffmpeg.load()` رخ می‌دهد و handshake با worker کامل نمی‌شود.
- نسخه‌ی فعلی `@ffmpeg/ffmpeg` از worker ماژولی استفاده می‌کند و امکان پاس دادن `classWorkerURL`، `workerURL`، `coreURL` و `wasmURL` را دارد.
- loader فعلی در `transcodeToMp4.ts` فقط `coreURL/wasmURL` را می‌دهد و worker را صریح و سازگار با Vite تنظیم نمی‌کند.
- fallback فعلی هم به `dist/umd` تکیه دارد، در حالی که برای این پکیج/محیط Vite مسیر `esm` و worker صریح پایدارتر است.

## برنامه اجرا
### 1) بازنویسی loader مشترک ffmpeg
فایل: `src/modules/generator-ui/lib/transcodeToMp4.ts`
- وارد کردن URL لوکال worker از خود پکیج `@ffmpeg/ffmpeg`.
- تغییر loader از حالت فعلی به loader صریح و کامل:
  - local: `coreURL + wasmURL + classWorkerURL`
  - remote fallback: `dist/esm` با `coreURL + wasmURL + workerURL + classWorkerURL`
- حذف وابستگی به fallback ناقص فعلی مبتنی بر `umd`.
- نگه داشتن timeoutها، singleton و `resetFFmpeg`.
- اگر load شکست خورد، خطا شامل این باشد که failure در کدام بخش بوده: `class worker`, `core`, `wasm`, یا `remote fallback`.

### 2) هم‌راستا کردن مسیر Video-to-Video با loader جدید
فایل: `src/modules/generator-ui/lib/editVideoWithAi.ts`
- بدون ساخت مسیر موازی جدید، از همان loader اصلاح‌شده‌ی مشترک استفاده شود.
- خطاهای مرحله‌ی load/extract/edit/encode واضح بمانند.
- اگر reset/retry لازم شد، روی همان loader نهایی انجام شود.

### 3) شفاف‌سازی خطا در UI
فایل: `src/modules/generator-ui/components/VideoToVideoDialog.tsx`
- نمایش پیام خطای نهایی حفظ شود، اما متن کاربرپسندتر شود تا اگر باز هم load شکست خورد، دقیقاً مشخص باشد مشکل لود موتور ویدئو است نه prompt یا خود ویدئو.
- متن progress فقط وقتی ffmpeg واقعاً لود شد از `Preparing…` عبور کند.

### 4) اعتبارسنجی بعد از اصلاح
- بررسی اینکه با باز کردن دیالوگ، مرحله‌ی `Preparing…` از 0٪ عبور کند.
- تست اینکه extraction شروع شود و progress stage عوض شود.
- تست اینکه Final Film/trim که از همان loader استفاده می‌کند regress نشود.
- حذف هر کد مرده یا fallback ناقص قبلی اگر بعد از اصلاح دیگر استفاده نشود.

## جزئیات فنی
- ریشه‌ی مشکل در خود feature Video-to-Video نیست؛ در loader مشترک ffmpeg است.
- برای این نسخه از `@ffmpeg/ffmpeg`، `load()` از worker ماژولی استفاده می‌کند و `classWorkerURL` می‌تواند برای Vite ضروری باشد.
- از آن‌جا که `ffmpeg-core.js` و `wasm` با 200 برمی‌گردند ولی `load()` timeout می‌شود، failure محتمل در bootstrap شدن worker/worker-to-core chain است، نه دانلود فایل خام.
- راه‌حل درست این است که worker chain به‌صورت explicit و سازگار با Vite تعریف شود، نه اینکه فقط timeout را بیشتر کنیم.

## خروجی مورد انتظار
بعد از پیاده‌سازی، Video-to-Video باید:
- از 0٪ عبور کند
- وارد مرحله‌ی `Extracting frames…` شود
- در صورت خطا، پیام واقعی و دقیق نشان دهد
- از همان زیرساخت پایدار ffmpeg در کل اپ استفاده کند