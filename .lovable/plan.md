# قابلیت درگ نوار موزیک و ویس برای تعیین نقطه‌ی شروع

## هدف
هر یک از نوارهای موزیک و ویس‌اوور باید به‌صورت افقی قابل درگ باشند تا کاربر نقطه‌ی شروعِ پخشِ آن صدا را روی تایم‌لاین ویدیو جابه‌جا کند (آفست شروع). درگ به راست = شروع دیرتر، درگ به چپ = شروع زودتر (حداقل ثانیه صفر). این آفست هم در پیش‌نمایش زنده و هم در فیلم نهایی اعمال می‌شود.

## رفتار مورد انتظار
- کشیدن نوار موزیک به سمت راست تا ثانیه ۳ ⇒ موزیک از ثانیه ۳ ویدیو شروع به پخش می‌کند؛ قبل از آن سکوت.
- کشیدن به چپ ⇒ شروع زودتر، کف صفر (نمی‌توان قبل از شروع ویدیو پخش کرد).
- هر نوار آفست مستقل خودش را دارد (موزیک جدا، ویس جدا).
- یک نشانگر/برچسب کوچک مقدار آفست را به‌صورت `m:ss` نشان می‌دهد.

## تغییرات

### ۱) State آفست در DashboardPage
- افزودن دو state جدید: `musicOffsetSec` و `voiceOffsetSec` (پیش‌فرض ۰).
- پاس دادن آن‌ها به `SequentialClipPlayer` و `VideoWithSoundtrack` و به مسیر ساخت فیلم نهایی.
- ریست آفست‌ها هنگام حذف/تعویض موزیک یا ویس.

### ۲) درگ روی نوارها — `PreviewSoundtrackWaveforms.tsx`
- افزودن propهای `musicOffset`, `voiceOffset` و callbackهای `onMusicOffsetChange`, `onVoiceOffsetChange`.
- روی هر کانتینر نوار، هندلر درگ (pointer down/move/up) اضافه می‌شود که جابه‌جایی افقی پیکسلی را با نسبت «طول فیلم بر عرض نوار» به ثانیه تبدیل می‌کند و آفست را به‌روزرسانی می‌کند (clamp به ≥ ۰).
- در حین درگ، نوار با `transform: translateX` به‌صورت بصری جابه‌جا می‌شود و یک برچسب آفست نمایش داده می‌شود (مثل `+0:03`).
- نگه‌داری آفست‌ها در ref تا منطق sync بدون بازسازی WaveSurfer مقدار تازه بخواند.

### ۳) منطق همگام‌سازی پخش با آفست
- در `handleSeek` و `syncTime`: زمان مؤثر هر تراک = `videoCurrentTime - offset`.
  - اگر منفی بود (هنوز به نقطه‌ی شروع نرسیده) ⇒ تراک pause/سکوت و در ابتدای خودش نگه داشته شود.
  - در غیر این صورت همان نگاشت فعلی با زمان مؤثر انجام شود (ویس ۱:۱، موزیک داخل پنجره‌ی انتخاب‌شده با loop).
- در `play`: اگر آفست هنوز فرا نرسیده، آن تراک فعلاً پخش نشود؛ با پیشرفت `syncTime` به‌صورت خودکار وارد پخش شود.

### ۴) اعمال در فیلم نهایی — `mergeVideos.ts`
- افزودن `delaySec` به `MergeMusicTrack` و `MergeVoiceoverTrack`.
- هنگام شروع ضبط (بعد از `recorder.start`)، به‌جای پخش فوری، پخش هر تراک با `setTimeout(delaySec * 1000)` نسبت به شروع فیلم زمان‌بندی شود؛ تا قبل از آن صدای آن تراک در میکس نباشد (سکوت).
- پاکسازی تایمرها در مسیر پایان/abort.

### ۵) اتصال در DashboardPage
- در ساخت `audioOpt`: `delaySec: musicOffsetSec` برای موزیک و `delaySec: voiceOffsetSec` برای ویس.
- پاس دادن آفست‌ها به هر دو محل رندر `SequentialClipPlayer` و `VideoWithSoundtrack`.

## جزئیات فنی
- تبدیل پیکسل↔ثانیه: `secondsPerPixel = filmDuration / waveformWidthPx`. طول فیلم از مجموع کلیپ‌ها (در SequentialClipPlayer موجود است) یا duration ویدیو (در VideoWithSoundtrack) گرفته می‌شود.
- آفست همیشه clamp به بازه‌ی `[0, filmDuration]`.
- درگ با Pointer Events پیاده می‌شود تا روی موبایل/دسکتاپ کار کند؛ `interact:false` روی WaveSurfer دست‌نخورده می‌ماند (خود ویوفرم نباید seek مستقل کند).

## فایل‌های درگیر
- `src/modules/generator-ui/components/PreviewSoundtrackWaveforms.tsx`
- `src/modules/generator-ui/components/VideoWithSoundtrack.tsx` (پاس‌دادن props)
- `src/modules/generator-ui/components/SequentialClipPlayer.tsx` (پاس‌دادن props)
- `src/modules/generator-ui/lib/mergeVideos.ts` (delaySec)
- `src/modules/generator-ui/pages/DashboardPage.tsx` (state + اتصال)
