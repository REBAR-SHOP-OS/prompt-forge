# قابلیت تنظیم زمان شروع/پایان موزیک و وُیس روی فیلم نهایی

هدف: کاربر بتواند برای هر دو تِرَک (موزیک و وُیس) دو چیز را انتخاب کند:
1. **بازه روی تایم‌لاین ویدئو** — اینکه صدا از چه ثانیه‌ای از فیلم شروع و در چه ثانیه‌ای تمام شود.
2. **بخش صدا** — کدام قسمت از خود فایل صوتی پخش شود (مثل قابلیت فعلی موزیک، که حالا برای وُیس هم اضافه می‌شود).

بیرون از بازه روی ویدئو، صدا کاملاً ساکت است (بدون لوپ تا انتهای فیلم).

## تغییرات اصلی

### ۱) مدل داده — افزودن بازهٔ تایم‌لاین ویدئو
- `mergeVideos.ts`: به `MergeMusicTrack` و `MergeVoiceoverTrack` فیلدهای اختیاری `timelineStartSec` و `timelineEndSec` (جای‌گذاری روی طول کل ویدئو) اضافه می‌شود. برای وُیس هم `sourceStartSec`/`sourceEndSec` (بخش انتخابی فایل صوتی) اضافه می‌شود.
- `DashboardPage.tsx`: stateهای جدید:
  - `musicTimeline: [number, number]` و `voiceoverTimeline: [number, number]` (بازه روی ویدئو)
  - `voiceoverRange: [number, number]` و `voiceoverDuration` (بخش صدای وُیس، مشابه `musicRange` موجود)

### ۲) دیالوگ تنظیمات
- **دیالوگ موزیک موجود** (Soundtrack for Final Film): افزودن یک بخش «زمان روی ویدئو» با دو اسلایدر/هندل start و end نسبت به `mergedDurationSec` (طول کل فیلم نهایی). بخش «انتخاب قسمت صدا» (waveform فعلی) حفظ می‌شود.
- **دیالوگ مشابه برای وُیس**: همان ساختار — یک `SoundtrackWaveform` برای انتخاب بخش صدای وُیس + اسلایدر بازهٔ روی ویدئو. از طریق آیکن/دکمهٔ موجود وُیس باز می‌شود.

### ۳) پخش هم‌زمان در پیش‌نمایش
- `PreviewSoundtrackWaveforms.tsx`: props جدید `musicTimeline`، `voiceoverTimeline`، `voiceoverRange` دریافت می‌کند.
  - در `play`/`handleSeek`/`syncTime`: هر تِرَک فقط وقتی پخش می‌شود که `videoCurrentTime` داخل بازهٔ تایم‌لاین آن باشد؛ بیرون از بازه pause و ساکت.
  - نگاشت زمان ویدئو به زمان صدا: `audioTime = sourceStart + (videoTime - timelineStart)`، محدود به `sourceEnd`.
  - رفتار لوپ فعلی موزیک با حالت «سکوت بیرون از بازه» جایگزین می‌شود.
- `VideoWithSoundtrack.tsx` و `SequentialClipPlayer`: عبور دادن propهای جدید.

### ۴) رندر نهایی (mergeVideos)
- منطق `soundtrackEl`/`voiceoverEl`: به‌جای شروع از t=0 و لوپ، با کنترل `requestAnimationFrame` بر اساس playhead کل فیلم، هر تِرَک را فقط داخل بازهٔ `timelineStart..timelineEnd` پخش و گِین آن را بیرون از بازه صفر می‌کند (سکوت). نگاشت source range مثل پیش‌نمایش.

### ۵) ساخت پارامترها هنگام Save/Merge
- در محل ساخت `audio` برای merge (حدود خط ۵۵۰۰ در `DashboardPage.tsx`)، مقادیر timeline و range وُیس به `music`/`voiceover` اضافه می‌شوند.

## نکات
- مقدار پیش‌فرض بازهٔ تایم‌لاین = کل طول فیلم (`[0, mergedDurationSec]`) تا رفتار فعلی برای کاربرانی که چیزی تنظیم نمی‌کنند حفظ شود (بدون شکستن پروژه‌های موجود).
- back-compat: نبودِ فیلدهای جدید = پخش روی کل ویدئو (مثل قبل).
- فقط کد فرانت‌اند و منطق پخش/رندر سمت کلاینت تغییر می‌کند؛ هیچ تغییری در بک‌اند/اسکیما لازم نیست.

## فایل‌های تحت تأثیر
- `src/modules/generator-ui/lib/mergeVideos.ts`
- `src/modules/generator-ui/components/PreviewSoundtrackWaveforms.tsx`
- `src/modules/generator-ui/components/VideoWithSoundtrack.tsx`
- `src/modules/generator-ui/pages/DashboardPage.tsx` (و در صورت نیاز `SequentialClipPlayer`)
