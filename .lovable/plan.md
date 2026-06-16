# هدف
همه‌ی کنترل‌های مربوط به Voiceover — یعنی تنظیم صدا (volume)، انتخاب بازه‌ی صوتی روی waveform (PLAY SELECTION)، و «Play on video from … to» (Start/End) — به داخل پنجره‌ی Voiceover منتقل شوند تا کاربر همه‌چیز را در یک‌جا (همان دیالوگ Voiceover) انجام دهد. پاپ‌اوور جداگانه‌ی کنار تب Voiceover حذف می‌شود.

# وضعیت فعلی
- تب «Voiceover» دیالوگ تولید را باز می‌کند: متن، Gender، Tone، Duration، Generate، Download، Use as soundtrack (تصویر سوم).
- یک پاپ‌اوور جداگانه با آیکون اسلایدر (تصویر اول) شامل این موارد است و در `DashboardPage.tsx` خطوط ۷۴۲۶–۷۵۰۹ قرار دارد:
  - اسلایدر صدای Voiceover
  - `SoundtrackWaveform` برای انتخاب بازه‌ی منبع صدا (PLAY SELECTION)
  - بخش «Play on video from … to» با اسلایدرهای Start/End
- این کنترل‌ها به state موجود در `DashboardPage` وابسته‌اند: `voiceoverVolume`, `voiceoverRange`, `voiceoverTimeline`, `voiceoverDuration`, `mergedDurationSec`, `voiceoverWaveformRef`.

# تغییرات (فقط فرانت‌اند/UI)

## ۱) افزودن کنترل‌ها به `VoiceoverDialog`
به `VoiceoverDialog` پراپ‌های جدید اضافه می‌شود تا کنترل‌های تایمینگ/صدا را برای voiceover فعال نمایش دهد:
- `activeVoiceoverUrl`, `activeVoiceoverName`
- `voiceoverVolume` + `onVoiceoverVolumeChange`
- `voiceoverRange` + `onVoiceoverRangeChange`
- `voiceoverTimeline` + `onVoiceoverTimelineChange`
- `voiceoverDuration` + `onVoiceoverDurationChange`
- `mergedDurationSec`
- `waveformRef` (همان `SoundtrackWaveformHandle`)
- `onClearVoiceover`

داخل دیالوگ، هرگاه `activeVoiceoverUrl` وجود داشته باشد، یک بخش «تنظیمات روی فیلم» زیر بخش تولید نمایش داده می‌شود که دقیقاً همان UI پاپ‌اوور فعلی را دارد:
- اسلایدر صدای Voiceover
- `SoundtrackWaveform` (انتخاب بازه‌ی منبع + PLAY SELECTION)
- اسلایدرهای Start/End برای «Play on video from … to» با محدودیت `mergedDurationSec`
- متن راهنما «Outside this window the voiceover is silent…»

`SoundtrackWaveform`، `Slider` و helper `formatTimeMS` در همان فایل دیالوگ import/تعریف می‌شوند.

## ۲) رفتار دیالوگ پس از اعمال
- پس از «Use as soundtrack»، به‌جای بستن کامل، دیالوگ باز می‌ماند تا کاربر بلافاصله تایمینگ/صدا را در همان‌جا تنظیم کند (بستن از طریق دکمه‌ی Close).
- وقتی voiceover از قبل اعمال شده باشد، باز کردن تب Voiceover مستقیماً بخش تنظیمات را هم نشان می‌دهد.

## ۳) حذف پاپ‌اوور جداگانه از `DashboardPage`
بلوک پاپ‌اوور آیکون اسلایدر (خطوط ۷۴۲۶–۷۵۰۹) حذف می‌شود. تب Voiceover و `<VoiceoverDialog .../>` باقی می‌مانند و پراپ‌های جدید (state و setterها و `voiceoverWaveformRef` و `mergedDurationSec` و `handleClearVoiceover`) به دیالوگ پاس داده می‌شوند.

# خارج از محدوده
- بخش Music و پاپ‌اوور آن بدون تغییر می‌ماند (درخواست فقط درباره‌ی Voiceover است).
- منطق merge/render (`mergeVideos.ts`) و نحوه‌ی استفاده از `voiceoverRange`/`voiceoverTimeline` در ساخت فیلم تغییری نمی‌کند؛ فقط محل کنترل‌ها جابه‌جا می‌شود.

# اعتبارسنجی
- باز کردن تب Voiceover ← تولید voiceover ← همان دیالوگ بدون بسته‌شدن، اسلایدر صدا، waveform و Start/End را نشان می‌دهد.
- تنظیم Start/End و بازه‌ی منبع داخل دیالوگ ← ساخت Final Film: voiceover دقیقاً در همان بازه اعمال می‌شود (رفتار قبلی حفظ شود).
- دیگر هیچ آیکون/پاپ‌اوور جداگانه‌ای کنار تب Voiceover وجود ندارد.
