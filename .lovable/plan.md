## مشکل

عملیات Trim دو فاز دارد ولی فقط فاز اول به نوار پیشرفت گزارش می‌شود:

1. **Record با MediaRecorder** — تمام `onProgress` به دیالوگ می‌رسد و سریع به ۱۰۰٪ می‌رسد.
2. **ensureMp4 با ffmpeg.wasm** (load core + remux/encode + readFile) — می‌تواند چند ثانیه تا چند دقیقه طول بکشد ولی هیچ خبری به UI نمی‌رسد.

نتیجه: کاربر «Rendering… 100%» را می‌بیند و فکر می‌کند گیر کرده، در حالی‌که ffmpeg در پس‌زمینه کار می‌کند.

علت در `src/modules/generator-ui/lib/trimVideo.ts` خط ۳۷۳–۳۷۴: `ensureMp4(finalBlob, mimeType)` بدون callback پیشرفت صدا زده شده، در حالی‌که `ensureMp4` پارامتر `Mp4ProgressCallback` با مراحل `loading|remux|encode|readout` دارد.

## راه‌حل

### `src/modules/generator-ui/lib/trimVideo.ts`

- مقدار `onProgress` فاز ضبط را به نیمه اول ماپ کنیم: `ratio * 0.5`.
- موقع فراخوانی `ensureMp4` یک callback بدهیم که فازهای ffmpeg را به نیمه دوم ماپ کند:
  - `loading` → 0.5 → 0.55
  - `remux`   → 0.55 → 0.95
  - `encode`  → 0.55 → 0.95
  - `readout` → ~1.0
- ساختار `TrimProgress` را گسترش دهیم به `{ ratio: number; stage?: string }` بدون شکستن callerهای فعلی.

### `src/modules/generator-ui/components/ClipTrimmerDialog.tsx`

- state جدید `stageLabel` که از `onProgress` ست می‌شود (مثلاً «Recording»، «Loading encoder»، «Encoding»، «Finalizing»).
- داخل دکمه Apply کنار درصد، برچسب فاز نمایش داده شود.

هیچ تغییری در بک‌اند، edge functions، یا منطق `applyTrimToCard` لازم نیست. خروجی نهایی (`Blob`, `duration`, `extension`) بدون تغییر می‌ماند.

## فایل‌های تغییر یافته

- `src/modules/generator-ui/lib/trimVideo.ts`
- `src/modules/generator-ui/components/ClipTrimmerDialog.tsx`

## اعتبارسنجی

- پس از رسیدن فاز ضبط به ۵۰٪، برچسب به «Loading encoder…» و سپس «Encoding…» و در پایان «Finalizing…» تغییر کند و درصد واقعاً به سمت ۱۰۰٪ پیش برود.
- در پایان، دیالوگ بسته و کلیپ ویرایش‌شده در کارت Pending ظاهر می‌شود.
- در صورت خطا یا timeout ffmpeg، پیغام خطای فعلی همچنان نمایش داده می‌شود.
