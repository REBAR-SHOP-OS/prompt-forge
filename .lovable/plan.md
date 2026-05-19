# رفع مشکل هنگ کردن خروجی نهایی بعد از Apply Changes

## علت ریشه‌ای

فایل `src/modules/generator-ui/lib/trimVideo.ts` برای حذف بازه‌های Cut از این الگو استفاده می‌کند:

1. `recorder.pause()` صدا زده می‌شود
2. ویدئو `seek` می‌شود تا انتهای بازه‌ی cut
3. روی رویداد `seeked`، `recorder.resume()` انجام می‌شود

مشکل: `MediaRecorder.pause()/resume()` در Chrome وقتی ورودی آن یک `canvas.captureStream()` + `MediaElementAudioSource` است، رفتار قابل‌اعتمادی ندارد. فریم‌های canvas و سمپل‌های صوتی در حین pause همچنان به stream می‌ریزند و بعد از resume، یک قطعه‌ی «فریز» معادل مدت seek (و گاهی معادل خود بازه‌ی cut) داخل خروجی نوشته می‌شود. دقیقاً همان «بعضی جاهاش هنگ می‌کنه»ای که گزارش شد. تشخیص ورود به بازه‌ی cut هم بعد از `drawContain` انجام می‌شود، پس حداقل یک فریم از داخل بازه‌ی cut هم رسماً رکورد می‌شود.

علاوه بر آن، detect شدن cut «وقتی t داخل بازه است» باعث می‌شود seek دیر شروع شود و در بازه‌های پشت‌سر‌هم نیز یک‌بار pause/resume اضافه رخ دهد.

## راهکار

بازنویسی هسته‌ی `trimVideoLocally` بر مبنای «keep segments» به‌جای «cut detection حین play»، بدون استفاده از `recorder.pause/resume`:

1. از روی `normalizeCuts` لیست بازه‌های keep را بسازیم: `[[0,c1.start],[c1.end,c2.start],…,[cN.end,duration]]` (با حذف بازه‌های صفر/منفی).
2. یک `MediaRecorder` واحد برای کل عملیات روشن می‌شود و **هرگز pause نمی‌شود**.
3. برای هر keep segment:
   - ابتدا `video.pause()` و `video.currentTime = seg.start`، منتظر `seeked` می‌مانیم. در این بازه‌ی seek، لوپ rAF/painting **متوقف** است و آخرین فریم سالم روی canvas باقی می‌ماند. چون این فاصله کوتاه (~50–200ms) و بدون قطع رکوردر است، چیزی به خروجی اضافه نمی‌شود که شبیه فریز بزرگ دیده شود (در عمل به‌صورت یک crossfade خیلی کوتاه بین دو سگمنت دیده می‌شود).
   - برای حذف کامل همان میکرو-فریز هم، درست قبل از play کردن سگمنت بعدی، یک‌بار `drawContain` با فریم seek‌شده اجرا می‌شود تا canvas دقیقاً اولین فریم سگمنت بعدی را داشته باشد.
   - سپس `video.play()` و rAF فعال می‌شود؛ در هر tick بررسی می‌کند اگر `video.currentTime >= seg.end - epsilon` بود، rAF را متوقف و به سگمنت بعدی می‌رود.
4. بعد از آخرین سگمنت، `recorder.stop()` و Blob نهایی ساخته می‌شود.
5. مسیر صدا بدون تغییر باقی می‌ماند (MediaElementSource → MediaStreamDestination). چون recorder pause نمی‌شود و در فاصله‌ی seek هم ویدئو pause است (پس audio source هم خاموش است)، gap صدا متناظر با gap بصری می‌شود و sync حفظ می‌شود.
6. اگر `cuts.length === 0` (فقط Mute audio)، مسیر فعلی حفظ می‌شود؛ یک پاس play کامل بدون seek.

## ملاحظات

- `normalizeCuts`, `totalKeptDuration`, امضای `TrimResult` و رابط `trimVideoLocally(srcUrl, cuts, options)` بدون تغییر می‌مانند، پس `ClipTrimmerDialog.tsx` نیازی به تغییر ندارد.
- `onProgress` بر اساس مجموع زمان keep شده تا الان محاسبه می‌شود تا progress bar یکنواخت پیش برود.
- روی Safari که MediaRecorder محدودیت‌های بیشتری دارد، نبودن pause/resume باعث پایداری بهتر خروجی هم می‌شود.

## فایل‌های تغییر

- `src/modules/generator-ui/lib/trimVideo.ts` — بازنویسی تابع `trimVideoLocally` با الگوی keep-segments و حذف کامل `recorder.pause()/resume()`.

## اعتبارسنجی

- بعد از تغییر، با همان دیالوگ Trim و یک ویدئوی نمونه با ۲–۳ بازه‌ی cut پراکنده تست شود؛ خروجی نهایی نباید بخش فریزشده‌ای نزدیک مرز cut داشته باشد و طول نهایی باید با مقدار «New length» نمایش‌داده‌شده در دیالوگ همخوان باشد.
