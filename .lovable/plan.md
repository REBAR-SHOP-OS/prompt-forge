برنامه‌ی اصلاح امن و محدود:

1. **رفع اتصال eventهای ویدئو به soundtrack**
   - در `VideoWithSoundtrack.tsx` وابستگی sync effect را به `resolvedSrc` / `videoKey` هم وصل می‌کنم.
   - دلیل: الان وقتی URL ویدئو ابتدا در حالت loading/proxy است، effect ممکن است قبل از ساخته‌شدن `<video>` اجرا شود و دیگر به ویدئوی واقعی وصل نشود؛ در نتیجه waveform دیده می‌شود ولی play/pause/seek به audio نمی‌رسد.

2. **پایدار کردن lifecycle پخش native audio**
   - در `PreviewSoundtrackWaveforms.tsx` برای هر ترک (`music`, `voiceover`) readiness جداگانه با `loadedmetadata/canplay/error` اضافه می‌کنم.
   - اگر play قبل از آماده شدن فایل صدا صدا زده شود، درخواست play ذخیره می‌شود و بعد از آماده شدن فایل اجرا می‌شود.
   - هنگام تغییر URL یا unmount، audio قبلی pause/reset می‌شود تا نمونه‌های قدیمی یا promiseهای قدیمی باعث سکوت/تداخل نشوند.

3. **همگام‌سازی دقیق‌تر با playhead**
   - `handleSeek` و `syncTime` همچنان تنها منبع زمان فیلم می‌مانند.
   - در `VideoWithSoundtrack` بعد از `loadedmetadata`، یک sync اولیه با `currentTime` انجام می‌شود تا صدا بعد از resolve شدن ویدئو از همان ثانیه درست شروع شود.
   - در `SequentialClipPlayer` فقط اگر لازم باشد، play state فعلی بعد از mount شدن waveform دوباره اعمال می‌شود؛ UI یا مدل تولید تغییر نمی‌کند.

4. **حفظ مسیر Final→Draft بدون دستکاری گسترده**
   - منطق `restoreDraftAudio` را فقط برای جلوگیری از timeline صفر/نامعتبر سخت‌تر می‌کنم؛ اگر duration فیلم هنوز معلوم نیست، ترک صوتی با بازه معتبر خودش فعال می‌ماند تا در preview خاموش نشود.
   - مسیرهای backend، storage policy، auth و generation UI دست‌نخورده می‌مانند.

5. **اعتبارسنجی بعد از پیاده‌سازی**
   - TypeScript check را اجرا می‌کنم.
   - با Playwright مسیر preview را بررسی می‌کنم: waveform موجود باشد، ویدئو play شود، hidden audioها src معتبر بگیرند، `paused=false` بعد از play شود، و seek/pause/play دوباره soundtrack را از دست ندهد.