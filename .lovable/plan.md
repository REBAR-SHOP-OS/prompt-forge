## مشکل واقعی

وقتی همهٔ کارت‌ها تصویر آپلودی هستند و کاربر FINAL FILM را می‌زند، `handleMergeAllVideos` این مسیر را طی می‌کند:

1. هر تصویر را با `imageUrlToClip` به یک فایل **webm** کوتاه (با MediaRecorder + canvas) تبدیل می‌کند.
2. این webmها را در باکت `merged-videos` آپلود می‌کند.
3. به `mergeVideoUrls` می‌دهد تا آن‌ها را به ترتیب در `<video>` باز کند، روی canvas بکشد و ضبط کند.

ریشهٔ مشکل: فایل‌های webm که `MediaRecorder` از `canvas.captureStream` می‌سازد **متادیتای duration ندارند** (`video.duration === Infinity`). در `mergeVideoUrls` هر کلیپ منتظر event `ended` می‌ماند که هرگز fire نمی‌شود → فرآیند برای همیشه منتظر می‌ماند، progress روی 0٪ گیر می‌کند، preview سیاه است، یا چند ثانیه بعد timeout/خطا می‌گیرد.

(کلیپ‌های ویدیویی واقعی این مشکل را ندارند چون duration معتبر دارند، به همین دلیل قبلاً با ویدیو کار می‌کرد.)

## راه‌حل

به‌جای دور زدن از طریق فایل webm میانی، تصاویر را **مستقیماً داخل خود `mergeVideoUrls` به‌عنوان «still segment» با مدت زمان مشخص** نقاشی کنیم. این کار:
- مرحلهٔ آپلود stillها را حذف می‌کند (سریع‌تر)
- مشکل Infinity duration را به‌طور کامل از بین می‌برد
- ترتیب کارت‌ها، transitionها و overlayها را دست‌نخورده نگه می‌دارد

## تغییرات کد

### 1. `src/modules/generator-ui/lib/mergeVideos.ts`
- نوع جدید `MergeClip = { kind: 'video', url: string } | { kind: 'image', url: string, durationSec: number }` اضافه شود.
- امضای `mergeVideoUrls` به `mergeClips(clips: MergeClip[], ...)` گسترش پیدا کند (یا یک تابع جدید `mergeClips` در کنارش اضافه شود تا مسیر «End frame append» موجود نشکند).
- در حلقهٔ اصلی:
  - برای کلیپ `video`: همان رفتار فعلی (load، play، paint با rAF، انتظار `ended`).
  - برای کلیپ `image`: تصویر را با `Image()` لود کن، روی canvas با `drawContain` بکش، overlayها را paint کن، با rAF مدام بکش، و دقیقاً بعد از `durationSec * 1000` میلی‌ثانیه با `setTimeout` به مرحلهٔ بعدی برو. هیچ `<video>` و `MediaRecorder` میانی لازم نیست.
- پشتیبانی transition (fade/slide/wipe/...) بین یک تصویر و کلیپ بعدی هم با snapshot گرفتن از آخرین فریم نقاشی‌شده روی canvas کار می‌کند (لازم نیست بدانیم منبع ویدیو بود یا تصویر).

### 2. `src/modules/generator-ui/pages/DashboardPage.tsx` (`handleMergeAllVideos`)
- حذف کامل بلاک تبدیل تصویر→webm→آپلود (خطوط ~۱۶۷۰–۱۶۹۲).
- به‌جای ساخت `urls: string[]`، ساخت `clips: MergeClip[]`:
  - برای کلیپ ویدیو: `{ kind: 'video', url: await proxiedVideoUrl(...) }`
  - برای کلیپ تصویر: `{ kind: 'image', url: await resolveSignedUrl(image.storage_path), durationSec: image.still_duration_seconds || 3 }`
- overlayها همچنان طبق `overlaysApi.getForClip(clip.id)` به‌ازای هر کلیپ پاس داده می‌شوند (هم برای ویدیو و هم برای تصویر؛ دیگر «burn-in» قبلی لازم نیست چون مستقیم در زمان merge نقاشی می‌شوند).
- `targetSize` همچنان از اولین کلیپ ویدیویی محاسبه می‌شود؛ اگر هیچ ویدیویی نبود از `aspectRatio` انتخاب‌شده fallback شود (همان رفتار فعلی).
- باقی منطق (آپلود نهایی به `merged-videos`، ساخت `mergedEntry`، اضافه به Library، تنظیم `previewVideoId`) دست‌نخورده می‌ماند.

### 3. مسیر «append End frame» در `imageUrlToClip`
- این تابع و فراخوانی‌های آن در خطوط ~۱۰۷۴ و ۱۱۴۱ (start/end-frame append به یک ویدیو) دست‌نخورده می‌ماند چون آن‌جا فقط ۲ کلیپ هستند و یکی از آن‌ها ویدیوی واقعی است (مشکل Infinity duration رخ نمی‌دهد). تغییری در `imageToClip.ts` لازم نیست.

## نتیجه

پس از این تغییر، کاربر می‌تواند چند تصویر آپلود کند، روی هر کارت overlay/متن اضافه کند، تأیید کند، و با زدن FINAL FILM یک ویدیوی واحد به ترتیب صحیح کارت‌ها — با تمام ویرایش‌ها و transitionها — در preview ببیند و در Library ذخیره شود.
