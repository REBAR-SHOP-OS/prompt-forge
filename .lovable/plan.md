## هدف
رفع گیر کردن Final Film در مرحله‌ی 94%/Finalizing و تست دوباره تا مطمئن شویم ساخت فیلم نهایی یا کامل می‌شود یا با خطای واضح و قابل بازیابی متوقف می‌شود، نه اینکه بی‌نهایت روی یک درصد بماند.

## یافته‌های فعلی
- Backend و Lovable Cloud سالم است؛ مشکل از مسیر نهایی‌سازی داخل مرورگر/فرانت‌اند است، نه از وضعیت کلی backend.
- عدد 94% در UI دقیقاً از مسیر `mergeVideoUrls` می‌آید: مرحله‌ی recording/transition عمداً روی 94% cap شده تا 95% به بعد برای finalizing/uploading باشد.
- پس وقتی Final Film روی 94% می‌ماند، merge قبل از رسیدن به callback مرحله‌ی `finalizing` گیر کرده است؛ محتمل‌ترین نقطه، انتظار برای پایان کلیپ/transition داخل `mergeVideoUrls` است.
- مسیر فعلی هنوز تا حدی به `video.play()`, رویداد `ended` و timeoutهای پراکنده وابسته است. اگر مرورگر در انتهای کلیپ، seek/playback یا event را درست تحویل ندهد، UI می‌تواند در 94% بماند.
- بعد از ساخت blob و upload هم چند کار snapshot/persist انجام می‌شود که timeout مستقل ندارد؛ این مورد می‌تواند در سناریوی دیگری Final Film را بعد از مرحله‌ی upload گیر بیندازد.

## برنامه‌ی اصلاح
1. **اصلاح هسته‌ی merge برای پایان قطعی کلیپ‌ها**
   - در `src/modules/generator-ui/lib/mergeVideos.ts` منطق پایان کلیپ و transition را مقاوم‌تر می‌کنم.
   - برای ویدیوها علاوه بر `ended`، یک watchdog مبتنی بر wall-clock و `currentTime >= duration - epsilon` اضافه می‌شود.
   - اگر `play()` reject شود یا ویدیو در انتهای فایل pause/stall شود، merge به‌جای گیر کردن، کلیپ را تمام‌شده حساب می‌کند یا خطای واضح می‌دهد.
   - AbortController در همه‌ی waitهای طولانی‌تر جدی گرفته می‌شود تا cancel واقعاً merge را متوقف کند.

2. **اصلاح نمایش progress**
   - اگر recording به انتهای کلیپ رسید، progress سریعاً از 94 به `Finalizing 95%` منتقل شود.
   - پیام stage دقیق‌تر شود تا کاربر بفهمد گیر در recording است، finalizing است یا upload.
   - خطاها با علت واقعی‌تر نمایش داده شوند، نه فقط پیام عمومی “Could not load source video”.

3. **محافظت از مرحله‌های بعد از upload**
   - در `DashboardPage.tsx` برای post-upload snapshot/persist source clips timeout اضافه می‌کنم تا Final Film بعد از upload هم گیر نکند.
   - اگر snapshot یک source clip fail/timeout شود، Final Film ساخته‌شده از بین نمی‌رود؛ فقط snapshot همان source با هشدار skip می‌شود.

4. **تست ریشه‌ای**
   - با ابزار مرورگر همان سناریوی Final Film را روی کلیپ‌های موجود تست می‌کنم.
   - مسیرهای مهم را بررسی می‌کنم:
     - single clip final film
     - چند clip با transition
     - final film با voiceover/music اگر در صفحه فعال باشد
     - cancel هنگام merge
   - لاگ console/network را بعد از تست چک می‌کنم؛ اگر خطا یا گیر دوباره دیده شد، همان‌جا اصلاح تکمیلی می‌زنم و دوباره تست می‌گیرم.

## فایل‌های مورد انتظار برای تغییر
- `src/modules/generator-ui/lib/mergeVideos.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx`

## بدون تغییر
- دیتابیس و مدل‌های Veo/Wan را تغییر نمی‌دهم، چون این مشکل در مرحله‌ی Final Film/merge داخل مرورگر رخ می‌دهد.
- کارت‌های Draft/Library را حذف یا reset نمی‌کنم؛ فقط رفتار ساخت Final Film مقاوم‌تر می‌شود.