## هدف
رفع ریشه‌ای خطای `video-edit load ffmpeg failed` تا دیالوگ Video-to-Video از `Preparing… 0%` عبور کند و مسیر ادیت ویدیو به‌صورت پایدار کار کند.

## کاری که انجام می‌دهم
1. اصلاح لودر مشترک FFmpeg در `transcodeToMp4.ts`
   - اضافه کردن `workerURL` واقعی برای `ffmpeg-core.worker.js` در کنار `coreURL`، `wasmURL` و `classWorkerURL`.
   - ساخت مسیر محلی و fallback ریموت به‌شکلی که با `@ffmpeg/ffmpeg@0.12.x` و Vite سازگار باشد.
   - حذف مسیرهای نیمه‌خراب/مبهمی که باعث timeout در `load()` می‌شوند.

2. تمیز کردن مسیر استفاده در `editVideoWithAi.ts`
   - نگه داشتن فقط یک مسیر لود/ریست تمیز برای FFmpeg.
   - اصلاح retry encoding چون الان بعد از `resetFFmpeg()` فایل‌سیستم پاک می‌شود و retry فعلی عملاً نمی‌تواند فریم‌ها را دوباره encode کند.
   - مطمئن شدن که خطاها واضح و قابل‌ردیابی می‌مانند.

3. بهبود پیام خطا در `VideoToVideoDialog.tsx`
   - نمایش پیام دقیق‌تر برای failureهای لودر/worker تا مشخص شود مشکل از engine است نه prompt یا خود ویدیو.
   - حفظ progress stageها بدون تغییر غیرضروری در UI.

4. اعتبارسنجی بعد از فیکس
   - تست اینکه progress از `Preparing…` به `Extracting frames…` حرکت کند.
   - تست اینکه مسیرهای دیگر وابسته به همین لودر، مخصوصاً `ensureMp4`, regression نخورند.
   - اگر هنوز failure باشد، همان‌جا path را دوباره اصلاح می‌کنم تا به یک مسیر پایدار برسد.

## جزئیات فنی
- ریشه‌یابی انجام‌شده نشان می‌دهد در نسخه نصب‌شده‌ی `@ffmpeg/ffmpeg`، worker داخلی هنگام `load()` به این ورودی‌ها تکیه می‌کند:
  - `coreURL`
  - `wasmURL`
  - `workerURL`
  - `classWorkerURL`
- الان فقط `classWorkerURL` پاس داده می‌شود. چون `coreURL` به `blob:` تبدیل شده، worker داخلی از روی آن یک `*.worker.js` نامعتبر/غیرقابل‌resolve می‌سازد و `load()` بدون reject شدن صریح، timeout می‌شود.
- علاوه بر این، retry فعلی در `editVideoWithAi.ts` بعد از `resetFFmpeg()` ناسازگار است چون فایل‌های فریم بعد از reset دیگر در FS جدید وجود ندارند.

## خروجی نهایی
- لودر FFmpeg پایدار با URLهای کامل worker
- مسیر encode/retry تمیز و قابل‌اعتماد
- خطای کاربرپسندتر در دیالوگ
- تست عملی روی همان جریان مشکل‌دار