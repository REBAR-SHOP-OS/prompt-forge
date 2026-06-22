## هدف
در پنجره Voiceover، بعد از ساخت صدا (عکس اول) فقط یک پخش‌کننده ساده نمایش داده می‌شود. باید به‌صورت خودکار همان پنل کامل تنظیمات عکس دوم (ولوم، موج صوتی با انتخاب بخش سبز، Play selection، و «Play on video from … to») نمایش داده شود.

## وضعیت فعلی
- در `VoiceoverDialog.tsx`، بعد از ساخت، `audioUrl` ست می‌شود و فقط یک `<audio controls>` ساده رندر می‌شود (بلوک خطوط ۳۸۴–۳۹۳).
- پنل کامل تنظیمات (موج صوتی + ولوم + بازه زمانی) فقط وقتی رندر می‌شود که `activeVoiceoverUrl` پر باشد — یعنی بعد از اینکه کاربر دستی روی دکمه موسیقی (Use as soundtrack) بزند.
- تابع والد `handleVoiceoverAsSoundtrack` در `DashboardPage.tsx` این url را به عنوان voiceover فعال ست می‌کند ولی پنجره را می‌بندد (`setIsVoiceoverOpen(false)`).

## تغییرات

### ۱) `DashboardPage.tsx` — تابع `handleVoiceoverAsSoundtrack`
- حذف خط `setIsVoiceoverOpen(false)` تا با اعمال خودکار، پنجره باز بماند و پنل تنظیمات بلافاصله دیده شود.
- بقیه منطق (ست‌کردن url/name، ریست range/timeline به کل فیلم) دست‌نخورده می‌ماند.

### ۲) `VoiceoverDialog.tsx` — اعمال خودکار بعد از ساخت
- در `handleGenerate`، بعد از موفقیت و ساختن `url` از blob، به‌جای فقط `setAudioUrl(url)`، به‌صورت خودکار `onUseAsSoundtrack?.(url, name)` صدا زده شود (با name به شکل `Voiceover (gender, tone).wav`).
- مالکیت url به والد منتقل می‌شود (`lastUrlRef.current = null`) تا revoke نشود؛ دقیقاً مثل منطق فعلی `handleUseAsSoundtrack`.
- این کار باعث می‌شود `activeVoiceoverUrl` پر شود و پنل کامل تنظیمات (خطوط ۳۹۵–۴۸۱) بلافاصله رندر شود.

### ۳) جایگزینی پخش‌کننده ساده
- بلوک `<audio controls>` ساده (خطوط ۳۸۴–۳۹۳) حذف می‌شود چون دیگر پنل کامل تنظیمات نمایش داده می‌شود و نمایش هم‌زمان هر دو تکراری است.
- دکمه‌های فوتر (Download / Use as soundtrack) باید همچنان کار کنند: شرط `disabled={!audioUrl}` به `disabled={!activeVoiceoverUrl}` تغییر می‌کند تا بعد از اعمال خودکار هم فعال بمانند، و `handleDownload` از `activeVoiceoverUrl` استفاده کند.

## نتیجه نهایی
بعد از زدن «Generate voiceover»، صدا ساخته می‌شود و بلافاصله همان پنل کامل عکس دوم (ولوم ۱۰۰٪، موج صوتی سبز با انتخاب بخش، Play selection، و اسلایدرهای Start/End برای پخش روی ویدیو) داخل همان پنجره نمایش داده می‌شود. هیچ منطق بک‌اند یا ذخیره‌سازی تغییر نمی‌کند.

## تست
- باز کردن Voiceover → نوشتن متن → Generate → بررسی نمایش خودکار پنل تنظیمات، کارکرد اسلایدر ولوم، انتخاب بخش روی موج، و اسلایدرهای بازه زمانی.
- بررسی اینکه دکمه Download فایل را دانلود می‌کند و typecheck پاس می‌شود.
