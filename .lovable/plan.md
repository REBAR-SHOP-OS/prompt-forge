## Goal
همه‌ی فیلم‌های نهایی که کاربر دانلود می‌کند باید با فرمت `.mp4` و کاملاً سازگار با هر پلیر (QuickTime, WMP, VLC, موبایل) باشند — نه webm، نه MP4 قطعه‌قطعه‌ی (fragmented) خروجی MediaRecorder.

## Approach
از آنجا که خروجی مستقیم `MediaRecorder` در کروم به‌صورت fragmented MP4 است و در پلیرهای دسکتاپ/موبایل پخش نمی‌شود، یک مرحله‌ی **ریماکس/ترنسکد در مرورگر با `@ffmpeg/ffmpeg` (ffmpeg.wasm)** اضافه می‌شود تا فایل به MP4 استاندارد (H.264 + AAC, `+faststart`) تبدیل گردد.

## Steps

1) **افزودن وابستگی ffmpeg.wasm**
   - نصب: `@ffmpeg/ffmpeg` و `@ffmpeg/util`
   - بارگذاری lazy فقط زمانی که نیاز شد (تا bundle بزرگ نشود).

2) **ابزار جدید: `src/modules/generator-ui/lib/transcodeToMp4.ts`**
   - تابع `ensureMp4(blob, mimeType): Promise<{ blob, mimeType: 'video/mp4', extension: 'mp4' }>`
   - اگر ورودی از قبل MP4 استاندارد بود → فقط با `-c copy -movflags +faststart` ریماکس می‌کند (سریع).
   - در غیر این صورت → ترنسکد به H.264/AAC با `libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -movflags +faststart`.

3) **تغییر `mergeVideos.ts`**
   - بعد از پایان `MediaRecorder` و قبل از return، خروجی را از `ensureMp4` عبور دهد.
   - `MergeResult` همیشه `extension: 'mp4'` و `mimeType: 'video/mp4'` برگرداند.
   - مسیر storage که با `.${mergeRes.extension}` ساخته می‌شود خودبه‌خود `.mp4` می‌شود (هیچ تغییر دیگری در DashboardPage لازم نیست برای فایل‌های جدید).

4) **تغییر `trimVideo.ts`**
   - همان رویکرد: خروجی نهایی trim هم از `ensureMp4` عبور کند تا فایل‌های ذخیره‌شده‌ی edited همیشه mp4 باشند.

5) **دکمه‌ی Download در `DashboardPage.tsx` (≈ خط 5306–5340)**
   - بعد از `fetch(url)` و گرفتن blob، اگر URL/blob از نوع mp4 نبود (فایل‌های قدیمی webm که هنوز در storage مانده‌اند)، با `ensureMp4` به mp4 تبدیل شود.
   - نام فایل همیشه `final-film-<id>.mp4` و `a.download` با همان نام.
   - حذف منطق فعلی تشخیص extension از URL.

6) **اعمال همین رفتار به سایر مسیرهای دانلود**
   - بررسی کوتاه DashboardPage برای هر دکمه‌ی Download دیگر (clip/edited) و یکسان‌سازی روی mp4.

## Technical notes
- `ffmpeg.wasm` به `SharedArrayBuffer` نیاز دارد در حالت multi-thread؛ نسخه‌ی single-thread (`@ffmpeg/ffmpeg` v0.12+) بدون COOP/COEP کار می‌کند و برای فایل‌های کوتاه (≤ چند دقیقه) سرعت کافی دارد.
- لود اولیه‌ی core (~30MB wasm) فقط یک‌بار در سشن و فقط هنگام merge/download انجام می‌شود؛ progress در UI همان progress فعلی merge ادامه می‌یابد (مرحله‌ی "Finalizing MP4…").
- فایل‌های قدیمی روی storage بازنویسی نمی‌شوند (non-destructive)؛ فقط در لحظه‌ی دانلود به mp4 تبدیل می‌شوند.
- بدون تغییر backend / schema / edge function.

## Files touched
- `package.json` (افزودن `@ffmpeg/ffmpeg`, `@ffmpeg/util`)
- `src/modules/generator-ui/lib/transcodeToMp4.ts` (جدید)
- `src/modules/generator-ui/lib/mergeVideos.ts`
- `src/modules/generator-ui/lib/trimVideo.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx` (دکمه‌های دانلود)
