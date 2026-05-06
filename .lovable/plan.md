## Goal

ریشه‌ای حل کردن مشکل صدا در فیلم نهایی: خروجی به جای WebM به‌صورت MP4 (H.264 + AAC) ضبط شود تا در همه‌جا (QuickTime، VLC، موبایل، ادیتورها) صدا پخش شود، و صدای اصلی هر کلیپ هم در ادغام حاضر باشد (وقتی کاربر موزیک نگذاشته است).

## Root Cause

دو مشکل به‌هم پیوسته:

1. **Container webm**: MediaRecorder در حال حاضر `video/webm;codecs=vp9,opus` تولید می‌کند. بسیاری از پلیرها (QuickTime، Premiere، گالری بعضی موبایل‌ها) فایل webm را اصلاً پخش نمی‌کنند یا audio track آن را نمی‌شناسند → کاربر تصور می‌کند «صدا ندارد».
2. **حذف کامل صدای کلیپ‌ها**: در منطق فعلی، عناصر `<video>` همیشه `muted = true` هستند و هیچ track صوتی‌ای از کلیپ‌ها وارد stream خروجی نمی‌شود؛ فقط وقتی کاربر موزیک می‌گذارد یک audio track اضافه می‌شود. وقتی موزیک نیست، خروجی هیچ track صوتی‌ای ندارد و این هم مشکل پخش را بدتر می‌کند.

## Fix

### ۱) ترجیح کانتینر MP4 (H.264 + AAC)

در `pickMimeType()` (در `src/modules/generator-ui/lib/mergeVideos.ts`)، ترتیب کاندیداها به این صورت تغییر می‌کند:

```text
video/mp4;codecs=avc1.42E01E,mp4a.40.2
video/mp4;codecs=avc1,mp4a
video/mp4
video/webm;codecs=vp9,opus
video/webm;codecs=vp8,opus
video/webm
```

- Chromium ≥ 130 و Safari ≥ 14.1 از ضبط مستقیم MP4 پشتیبانی می‌کنند → برای اکثر کاربران خروجی به‌صورت `.mp4` خواهد بود.
- اگر مرورگر MP4 را پشتیبانی نکند (Firefox، Chromium قدیمی‌تر)، به‌طور خودکار به WebM/Opus برمی‌گردد بدون شکست.
- یک تابع کوچک `mimeTypeToExtension(mt)` اضافه می‌شود که از روی mime type انتخاب‌شده پسوند صحیح (`mp4` یا `webm`) را می‌دهد.
- API تابع `mergeVideoUrls` به جای `Promise<Blob>` به `Promise<{ blob: Blob; extension: 'mp4' | 'webm'; mimeType: string }>` تغییر می‌کند تا فراخواننده پسوند درست را بداند.

### ۲) همیشه یک audio track در stream خروجی وجود داشته باشد

برای جلوگیری از فایل‌های «بدون audio track» که مشکل‌ساز هستند:

- یک `AudioContext` همیشه ساخته می‌شود و یک `MediaStreamAudioDestinationNode` به‌عنوان خروجی صدا.
- این destination همیشه یک audio track به stream اصلی اضافه می‌کند (حتی اگر صامت باشد).
- اگر کاربر موزیک گذاشته باشد → عنصر `<audio>` موزیک از طریق `createMediaElementSource` به destination وصل می‌شود و کلیپ‌ها muted می‌مانند (رفتار فعلی، حفظ می‌شود).
- اگر موزیک نگذاشته باشد → برای هر کلیپ ویدیو، عنصر `<video>` با `muted = false` ساخته می‌شود و صدای آن از طریق `createMediaElementSource` به همان destination وصل می‌شود. وقتی کلیپ تمام شد، گره صوتی آن disconnect می‌شود و گره کلیپ بعدی متصل می‌شود (در نتیجه صدای هر کلیپ در نوبت خود شنیده می‌شود).
- توجه: `createMediaElementSource` صدا را از پخش‌کنندهٔ پیش‌فرض جدا می‌کند و فقط به destination هدایت می‌کند → کاربر هنگام render چیزی نمی‌شنود (رفتار فعلی حفظ می‌شود).

### ۳) به‌روزرسانی فراخواننده (DashboardPage)

در `handleMergeAllVideos`:

- نتیجه‌ی `mergeVideoUrls` به‌صورت `{ blob, extension }` گرفته می‌شود.
- نام فایل: `merged-${Date.now()}.${extension}` (به‌جای `.webm` ثابت).
- contentType آپلود به Storage از `blob.type` استفاده می‌کند.
- بقیه‌ی منطق (آپلود، entry, preview، دانلود) بدون تغییر.

## Files Touched

- `src/modules/generator-ui/lib/mergeVideos.ts`:
  - بازنویسی `pickMimeType` با ترجیح MP4
  - افزودن export `mimeTypeToExtension`
  - تضمین وجود همیشگی یک audio track در stream خروجی
  - mux کردن صدای هر کلیپ هنگامی که موزیک وجود ندارد
  - تغییر return type به `{ blob, extension, mimeType }`
- `src/modules/generator-ui/pages/DashboardPage.tsx`:
  - به‌روزرسانی فراخوانی `mergeVideoUrls` و انتخاب پسوند فایل بر اساس `extension` برگشتی

## Compatibility & Risk

- مرورگرهایی که MP4 را پشتیبانی نکنند (مثل Firefox فعلی)، هم‌چنان WebM/Opus دریافت می‌کنند — اما حالا با audio track معتبر، که خود مشکل «بدون صدا» را در پلیرهای WebM-aware (Chrome, VLC) حل می‌کند.
- `createMediaElementSource` فقط یک‌بار قابل ساخت برای هر media element است؛ چون برای هر کلیپ یک عنصر `<video>` تازه می‌سازیم، مشکلی نیست.
- اگر مرورگر CORS کلیپ‌ها را به‌درستی نگذارد، `createMediaElementSource` خطا می‌دهد و در آن صورت کلیپ بدون صدا اما ویدیویش render می‌شود (graceful fallback).
- بدون تغییر در سرویس آپلود، DB، یا منطق UI/طراحی.

## Out of Scope

- بدون افزودن ffmpeg.wasm یا transcoding سمت سرور.
- بدون تغییر در رفتار موزیک (slider, dialog, …).
