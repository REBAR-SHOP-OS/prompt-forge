## Goal

اضافه کردن قابلیت موزیک پس‌زمینه: کاربر یک فایل صوتی آپلود می‌کند، یک بازه‌ی دلخواه از آن را انتخاب می‌کند، و هنگام ساخت «فیلم نهایی»، آن بازه روی کل ویدیوی ادغام‌شده اعمال می‌شود؛ صدای خود کلیپ‌ها قطع می‌شود.

## Current State

- `mergeVideoUrls` (در `src/modules/generator-ui/lib/mergeVideos.ts`) فقط تصویر را از طریق canvas/MediaRecorder ضبط می‌کند و **هیچ صدایی** در خروجی نیست (در حال حاضر کلیپ‌ها هم بدون صدا روی هم می‌چسبند).
- دکمه‌ی «Final film» در هدر بالای صفحه قرار دارد و `handleMergeAllVideos` را صدا می‌زند.
- منطق ادغام درون مرورگر اجرا می‌شود؛ اضافه کردن track صوتی از `<audio>` به stream خروجی از طریق `AudioContext` + `MediaStreamAudioDestinationNode` کاملاً امکان‌پذیر است.

## UX

در هدر بالای صفحه، یک دکمه‌ی آیکونی جدید کنار دکمه‌ی «Final film» اضافه می‌شود:

- آیکون: `Music` از lucide-react (هم‌استایل با Final film و Start over)
- وضعیت‌ها:
  - بدون موزیک → آیکون Music ساده، با کلیک یک file picker (`audio/*`) باز می‌شود
  - با موزیک بارگذاری‌شده → آیکون به `Music2` تغییر می‌کند + نام کوتاه فایل + یک ضربدر کوچک برای حذف
- پس از انتخاب فایل، یک popover/dialog کوچک باز می‌شود حاوی:
  - یک پخش‌کنندهٔ صوتی استاندارد برای پیش‌گوش‌دادن
  - یک **range slider دو سر** (start/end) برای انتخاب بازه (نمایش mm:ss)
  - دکمه‌های Preview (پخش بازه‌ی انتخابی) و Save
- وقتی موزیک تنظیم شده باشد، tooltip دکمه‌ی Final film می‌گوید: «Final film with music (00:12 – 00:34)»

## Behavior

هنگام کلیک روی Final film:

1. اگر موزیک تنظیم شده باشد → `mergeVideoUrls` با پارامتر `audio: { file, startSec, endSec }` فراخوانی می‌شود.
2. درون merger:
   - کلیپ‌های ویدیو با `muted = true` پخش می‌شوند (مثل قبل) → صدای کلیپ‌ها حذف
   - یک `HTMLAudioElement` با src موزیک ساخته می‌شود، `currentTime = startSec`، و درون `AudioContext` به یک `MediaStreamAudioDestinationNode` متصل می‌شود
   - track صوتی این destination به stream خروجی canvas اضافه می‌شود (`new MediaStream([videoTrack, audioTrack])`)
   - موزیک هم‌زمان با شروع ضبط play می‌شود؛ اگر طول بازه‌ی موزیک از طول کل ویدیو کوتاه‌تر بود، loop می‌شود؛ اگر طولانی‌تر بود، در `endSec` متوقف می‌شود
   - MediaRecorder با codec ‏`video/webm;codecs=vp9,opus` (یا fallback‏ vp8,opus) ضبط می‌کند
3. خروجی webm حاوی ویدیو + موزیک است؛ مانند قبل به باکت `merged-videos` آپلود و در preview نمایش داده می‌شود.
4. اگر موزیک تنظیم نشده باشد، رفتار دقیقاً مانند امروز باقی می‌ماند (بدون صدا).

موزیک فقط روی **فیلم ادغام‌شده‌ی نهایی** اعمال می‌شود؛ کارت‌های جداگانه‌ی History دست‌نخورده می‌مانند.

## State & Persistence

- state موزیک (فایل به‌صورت object URL در حافظه + start/end ثانیه + نام فایل) در DashboardPage نگه‌داری می‌شود.
- چون فایل صوتی Blob محلی است و قابل serialize شدن مفید در localStorage نیست، با refresh صفحه پاک می‌شود (مانند آپلود فریم‌ها). فقط نام آخرین فایل برای راحتی نمایش داده می‌شود.

## Files Touched

- `src/modules/generator-ui/lib/mergeVideos.ts` — افزودن پارامتر اختیاری `audio?: { src: string; startSec: number; endSec: number }` به `mergeVideoUrls`؛ ساخت AudioContext، اضافه کردن audio track به stream، مدیریت loop/stop در محدوده‌ی بازه. حفظ سازگاری کامل با signature قبلی.
- `src/modules/generator-ui/pages/DashboardPage.tsx`:
  - state جدید: `musicFile`, `musicObjectUrl`, `musicDurationSec`, `musicStartSec`, `musicEndSec`, `isMusicDialogOpen`
  - دکمه‌ی Music در هدر بالا (کنار Final film)
  - یک `<Dialog>` ساده با `<audio controls>` و دو slider (یا یک range dual-handle با دو `<input type="range">` برای start/end)
  - عبور تنظیمات موزیک به `handleMergeAllVideos` → `mergeVideoUrls`

## Out of Scope

- بدون افزودن کتابخانه‌ی جدید (از `Slider` موجود در `@/components/ui/slider` و `Dialog` موجود استفاده می‌شود).
- بدون mux کردن سرور-ساید با ffmpeg؛ همه‌چیز سمت کلاینت.
- بدون trim/fade پیشرفته؛ فقط cut ساده در `startSec` و `endSec` + loop در صورت کوتاه بودن.
- بدون اعمال موزیک روی تک‌کارت‌های جداگانه (فقط روی Final film).
