# نمایش پنل کامل waveform بعد از Generate (قبل از Use as soundtrack)

## هدف
وقتی کاربر داخل دیالوگ Voiceover روی **Generate voiceover** می‌زند و ویس ساخته می‌شود، بلافاصله همان پنل کامل اسکرین‌شات دوم (موج صوتی + ولوم + Play selection + Start/End) نمایش داده شود — بدون اینکه لازم باشد اول روی **Use as soundtrack** بزند. دکمه Use as soundtrack همچنان زیر این پنل می‌ماند تا کاربر بعد از پیش‌نمایش، ویس را روی فیلم اعمال کند.

## وضعیت فعلی
در `VoiceoverDialog.tsx`:
- بعد از Generate فقط یک `<audio>` ساده + دکمه «Use as soundtrack» نشان داده می‌شود (بلوک `audioUrl`).
- پنل کامل (موج صوتی، ولوم، Play selection، Start/End) فقط زمانی ظاهر می‌شود که `activeVoiceoverUrl` ست شده باشد — یعنی **بعد از** کلیک روی Use as soundtrack.

## تغییرات (فقط فرانت‌اند، فقط همین فایل)
`src/modules/generator-ui/components/VoiceoverDialog.tsx`:

1. **State محلی برای پیش‌نمایش** اضافه می‌شود تا پنل قبل از اعمال هم کار کند:
   - `previewVolume` (پیش‌فرض ۱)
   - `previewRange` (انتخاب بازه روی موج، `[0, duration]`)
   - `previewDuration` (طول ویس از `onReady` waveform)
   - یک `useRef` برای `SoundtrackWaveformHandle` مخصوص پیش‌نمایش.

2. **جایگزینی بلوک سادهٔ بعد از Generate**: به‌جای `<audio>` ساده، همان طرح پنل اسکرین‌شات دوم رندر می‌شود:
   - عنوان با آیکن میکروفون و نام ویس.
   - اسلایدر **Voiceover volume** (متصل به `previewVolume`).
   - کامپوننت `SoundtrackWaveform` با `url={audioUrl}`، بازه `previewRange`، دکمه‌های Play / Play selection (که خود کامپوننت دارد).
   - راهنمای «Drag the edges of the green box…».
   - بخش **Play on video from … to** با اسلایدرهای Start/End (محدودشده به طول ویس برای پیش‌نمایش، چون فیلم هنوز اعمال نشده).
   - دکمهٔ **Use as soundtrack** زیر پنل (بدون تغییر در رفتارش).

3. **ریست state پیش‌نمایش** هنگام تولید ویس جدید و هنگام بستن دیالوگ.

4. بلوک `activeVoiceoverUrl` (پنل بعد از اعمال روی فیلم) دست‌نخورده باقی می‌ماند تا رفتار فعلی فیلم خراب نشود.

## بخش فنی
- پنل پیش‌نمایش از همان `SoundtrackWaveform` و `Slider`های موجود استفاده می‌کند؛ هیچ کامپوننت جدیدی ساخته نمی‌شود.
- چون فیلم هنوز اعمال نشده، اسلایدرهای Start/End در پیش‌نمایش بر اساس طول خود ویس (`previewDuration`) کار می‌کنند و صرفاً جنبهٔ تنظیم/نمایش دارند؛ مقدار واقعی timeline همچنان بعد از Use as soundtrack از طریق propهای والد مدیریت می‌شود.
- هیچ تغییری در منطق بک‌اند، `tts-generate`، یا propهای والد لازم نیست.

## تأیید
- بعد از Generate، پنل کامل (موج + ولوم + Play selection + Start/End) بلافاصله دیده شود.
- Play selection و درگ بازهٔ سبز کار کند.
- کلیک روی Use as soundtrack مثل قبل ویس را روی فیلم اعمال کند.
