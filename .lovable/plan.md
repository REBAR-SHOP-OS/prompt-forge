## هدف
بازگشت Final Film به Draft باید واقعاً موسیقی و نریشن را هم به پروژه برگرداند، نه فقط آیکون‌های خالی را نشان دهد؛ سپس خودم با preview بررسی کنم که waveform و state صدا فعال شده‌اند.

## تشخیص ریشه‌ای
مشکل فقط fallback قبلی نبود. دو ریشه اصلی در کد دیده می‌شود:

1. **URL صدا از bucket خصوصی به صورت public/raw برمی‌گردد**
   - `projectAudio` آدرس‌هایی مثل `merged-videos/...` را ذخیره می‌کند.
   - کارت Library برای پخش همین صداها از `signStorageUrl` استفاده می‌کند.
   - اما `restoreDraftAudio` همان URL خام را مستقیم داخل `musicUrl` / `voiceoverUrl` می‌گذارد؛ بنابراین WaveSurfer و Final Film merge نمی‌توانند فایل صوتی را بخوانند و نتیجه Draft/Final بدون صدا می‌شود.

2. **باز کردن Final به Draft گاهی با state قدیمی `projectAudio` کار می‌کند**
   - `reopenFinalAsDraft` قبل از اینکه آخرین localStorage/server-hydrated state قطعی باشد، `projectAudio[finalId]` را از React state می‌خواند.
   - اگر state خالی/قدیمی باشد، mapping صدا به Draft منتقل می‌شود یا ذخیره می‌شود، ولی live audio state برای preview/merge دوباره تنظیم نمی‌شود.

## تغییرات پیشنهادی
فقط در مسیر صوت Final→Draft و امضای URLها تغییر می‌دهم؛ UI generation، auth، storage policies و backend framework دست نمی‌خورد.

### 1. Helper امن برای خواندن آخرین `projectAudio`
در `DashboardPage.tsx` یک helper کوچک اضافه می‌کنم که:
- آخرین `project-audio:${userId}` را مستقیم از localStorage بخواند.
- با React state فعلی merge شود.
- فقط entryهای مربوط به `finalId` و `draftId` را استفاده کند.

### 2. Helper برای پیدا کردن audio معتبر
یک تابع `resolveProjectAudioForReopen(finalId, draftId)` می‌سازم که به ترتیب این منابع را بررسی کند:
1. `projectAudio[finalId]` از آخرین persisted map
2. `projectAudio[draftId]` از آخرین persisted map
3. نسخه‌های state فعلی به عنوان fallback

و فقط وقتی `music` یا `voiceover` واقعی دارد آن را انتخاب کند.

### 3. امضای URL قبل از restore live audio
`restoreDraftAudio` را async می‌کنم تا قبل از `setMusicUrl` و `setVoiceoverUrl`:
- برای URLهای `merged-videos` / storage private از `signStorageUrl` استفاده کند.
- اگر URL از قبل `blob:` / `data:` / signed باشد، همان را نگه دارد.
- اگر signing شکست خورد، raw URL را ذخیره در metadata نگه دارد ولی برای live playback/merge فقط URL قابل fetch را ترجیح دهد.

نتیجه: waveform زیر preview واقعاً فایل را load می‌کند و merge بعدی صدا را هم دریافت می‌کند.

### 4. انتقال atomic اما با آخرین persisted state
در `reopenFinalAsDraft`:
- audio resolved شده را از helper جدید می‌گیرم.
- آن را زیر `draftId` ذخیره می‌کنم و `finalId` را حذف می‌کنم.
- سپس `await/void restoreDraftAudio(draftId, resolvedAudio)` را اجرا می‌کنم تا live music/voiceover state immediately فعال شود.
- `ensureActiveDraftIdRef.current = draftId` را هم همان لحظه تنظیم می‌کنم تا submit بعدی روی همان Draft ادامه پیدا کند.

### 5. جلوگیری از Final Film بی‌صدا بعد از restore
قبل از ساخت `audioOpt` در Final Film:
- اگر `musicUrl` یا `voiceoverUrl` از storage خصوصی باشد، یک URL fetchable/signed تازه برای merge می‌گیرم.
- این کار باعث می‌شود حتی اگر preview URL قبلی منقضی شده باشد، خروجی Final Film دوباره silent نشود.

### 6. اصلاح snapshot صدا
`persistAudioToStorage` را طوری امن‌تر می‌کنم که وقتی source خودش private storage URL است:
- اول آن را sign کند.
- سپس fetch/upload کند.
این باعث می‌شود snapshotهای بعدی music/voiceover دوباره fail نشوند.

## اعتبارسنجی
بعد از اعمال تغییرات:
1. Typecheck را اجرا می‌کنم.
2. با Playwright preview را باز می‌کنم.
3. localStorage test fixture با یک Final Film دارای `projectAudio` می‌سازم.
4. action بازگشت Final→Draft را اجرا/شبیه‌سازی می‌کنم.
5. بررسی می‌کنم:
   - `projectAudio[draftId]` وجود دارد.
   - `musicUrl` / `voiceoverUrl` به signed/fetchable URL تبدیل شده‌اند.
   - waveform containerها blank/error نیستند.
   - preview صدا را به player پاس می‌دهد.

## محدوده‌ای که تغییر نمی‌دهم
- UI تولید و layout اصلی
- auth
- storage policies
- backend/functions
- credit ledger
- merge encoder اصلی