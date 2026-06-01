هدف نهایی: Final Film دیگر روی ۹۴٪ گیر نکند، اگر مرحله‌ای کند/خراب شد با timeout و پیام دقیق خارج شود، و خروجی موفق همیشه به ۹۵/۹۹/۱۰۰ برسد و در Library ثبت شود.

محدودیت‌ها و ریسک‌ها:
- نباید کارت‌های Pending/Draft/Final یا فایل‌های Library حذف یا خراب شوند.
- تغییر باید حداقلی و روی مسیر Final Film/merge باشد، نه بازطراحی کل اپ.
- پردازش مرورگری MediaRecorder/Canvas حساس است؛ باید watchdog و cleanup قطعی داشته باشد.

تشخیص فعلی:
- ۹۴٪ دقیقاً سقف مرحله `recording` در `DashboardPage.tsx` است؛ یعنی `mergeVideoUrls` هنوز به مرحله `finalizing` نرسیده.
- محتمل‌ترین نقطه توقف داخل `mergeVideos.ts` بعد از شروع پخش کلیپ‌هاست: `whenClipEnded`/transition/playback ممکن است روی کلیپی که `ended` درست نمی‌دهد، duration اشتباه دارد، یا playhead جلو نمی‌رود منتظر بماند.
- timeout کلی ۱۰ دقیقه‌ای وجود دارد، اما UX تا آن زمان روی ۹۴٪ می‌ماند و جزئیات تشخیص کافی نیست.

برنامه پیاده‌سازی:
1. در `mergeVideos.ts` یک watchdog قطعی برای هر clip اضافه می‌کنم که علاوه بر `ended`، با wall-clock مدت واقعی کلیپ را کنترل کند؛ هیچ کلیپ/transition نتواند بیش از مدت خودش + حاشیه امن، recorder را نگه دارد.
2. برای `video.play()` failure و stalled playback، مسیر fallback را قوی‌تر می‌کنم: اگر پخش شروع نشد یا currentTime حرکت نکرد، آن کلیپ با خطای دقیق یا advance کنترل‌شده از مسیر خارج شود، نه اینکه UI روی ۹۴٪ بماند.
3. در مسیر transition، جلوی حالت خطرناک را می‌گیرم که `endedPromise` قبل از شروع playback/painting ساخته شود و بدون watchdog کافی معلق بماند.
4. progress را شفاف‌تر می‌کنم تا UI نشان دهد الان در کدام clip گیر کرده/در حال recording است، و به محض تمام شدن recording حتماً وارد `finalizing` با ۹۵٪ شود.
5. در `DashboardPage.tsx` timeout کلی را قابل کنترل‌تر می‌کنم: timeout timer بعد از موفقیت پاک شود، cancel واقعاً merge را abort کند، و خطای timeout پیام دقیق بدهد.
6. تست‌های واحد برای `mergeVideos.ts` اضافه/به‌روزرسانی می‌کنم تا سناریوهای `ended` نیامدن، duration نامعتبر، stalled clip، و مسیر موفق Final Film پوشش داده شود.
7. بعد از پیاده‌سازی، تست انتخابی را اجرا می‌کنم و با لاگ/شبکه/رفتار preview تا حد دسترسی موجود بررسی می‌کنم؛ اگر تست ایراد نشان داد، همان چرخه را تا رفع کامل تکرار می‌کنم.