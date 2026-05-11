# افزودن دکمه Mute به دیالوگ Trim clip

یک آیکون قطع/وصل صدا (Volume2 / VolumeX) کنار دکمه‌های «Mark cut start» در `ClipTrimmerDialog` اضافه می‌شود تا کاربر بتواند صدای ویدئوی نهایی را کاملاً حذف کند.

## رفتار

- یک state جدید `muteAudio` (پیش‌فرض false) در `ClipTrimmerDialog`.
- دکمه toggle با آیکون `Volume2` (روشن) یا `VolumeX` (خاموش) از `lucide-react`.
- وقتی فعال است:
  - پیش‌نمایش: `videoRef.current.muted = true` (فقط برای پیش‌نمایش داخل دیالوگ).
  - خروجی نهایی: به `trimVideoLocally` پارامتر `muteAudio: true` پاس داده می‌شود.

## تغییرات کد

**`src/modules/generator-ui/lib/trimVideo.ts`**
- افزودن آپشن سوم اختیاری به امضا: `trimVideoLocally(srcUrl, cuts, options?)` که `options.muteAudio?: boolean` و `options.onProgress?` را می‌پذیرد (سازگار با عقب).
- اگر `muteAudio === true`: از مسیر صوتی `AudioContext` صرف‌نظر شود و فقط `videoStream` ضبط شود (خروجی بدون track صوتی).

**`src/modules/generator-ui/components/ClipTrimmerDialog.tsx`**
- state `muteAudio` + دکمه آیکونی toggle در نوار کنترل (کنار «Mark cut start»).
- sync با `videoRef.current.muted` در یک `useEffect`.
- در `apply()`: ارسال `{ muteAudio }` به `trimVideoLocally`.
- ریست در زمان بستن دیالوگ.

بدون تغییر در backend یا سایر فایل‌ها.
