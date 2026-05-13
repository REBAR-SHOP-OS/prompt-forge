# Live audio in preview (music + voiceover)

## Goal
وقتی یوزر موزیک آپلود می‌کند یا یک Voiceover می‌سازد و "Use as soundtrack" می‌زند، صدا بلافاصله روی پیش‌نمایش زنده‌ی کارت‌ها (SequentialClipPlayer) پخش شود. Final Film فقط زمانی ساخته/سیو می‌شود که خود کاربر روی Final Film کلیک کند — رفتار فعلی Final Film و ذخیره در Library تغییری نمی‌کند.

## Scope
- فقط فرانت‌اند: `SequentialClipPlayer.tsx` و بخش رندر پیش‌نمایش در `DashboardPage.tsx`.
- بدون تغییر در `mergeVideos.ts`، edge functions، DB، یا منطق Final Film.

## Changes

### 1) `SequentialClipPlayer.tsx`
افزودن props اختیاری برای صدای پیش‌نمایش:
- `musicUrl?: string | null`
- `musicRange?: [number, number]` (اگر مشخص باشد، در شروع `currentTime = start` و در رسیدن به `end` لوپ شود)
- `musicVolume?: number` (0..1)
- `voiceoverUrl?: string | null`
- `voiceoverVolume?: number`
- `clipVolume?: number` (برای میوت/کم‌کردن صدای ویدیو در حین پخش music/voice — مطابق منطق فعلی داشبورد)

رفتار:
- دو `<audio>` مخفی داخل کامپوننت (music و voiceover).
- وقتی `isPlaying` فعال است، هر دو play می‌شوند؛ با Pause متوقف می‌شوند؛ با Prev/Next ادامه می‌دهند (قطع نمی‌شوند — تجربه‌ی "soundtrack مداوم").
- music در محدوده‌ی `musicRange` لوپ می‌کند تا کل دنباله را پر کند.
- voiceover یک‌بار از ابتدا پخش می‌شود (وقتی تمام شد، صرفاً ساکت می‌ماند).
- volume ویدیوی کارت با `clipVolume` تنظیم می‌شود (وقتی music هست → 0 یا soundtrackMode، وقتی فقط voiceover → `voiceoverClipVolume`).
- پاکسازی با unmount/تغییر url.

### 2) `DashboardPage.tsx`
در محل رندر فعلی `SequentialClipPlayer` (شاخه‌ی `previewItem.kind === 'sequence'`)، props جدید را از state موجود تغذیه کنیم:
- `musicUrl`, `musicRange`, `musicVolume`, `soundtrackMode`
- `voiceoverUrl`, `voiceoverVolume`, `voiceoverClipVolume`
- `clipVolume` با همان منطق محاسبه‌ای که در ساخت Final Film استفاده می‌شود (music-only → 0، mix → `clipVolume`، فقط voiceover → `voiceoverClipVolume`، هیچ‌کدام → 1).

حذف یا تغییر متن فوتر: «Voice & music are heard only in Final Film.» → «Live preview includes your music & voiceover. Final Film saves to Library.»

### 3) Single-clip preview
در شاخه‌های `previewItem.kind === 'video' | 'image'` (تک‌کارتی) هم همان audio overlay قابل اعمال است؛ برای ساده نگه داشتن کار، یک کامپوننت کوچک بدون UI به نام `PreviewAudioLayer` (یا inline در SequentialClipPlayer که در حالت تک‌کلیپ هم مصرف شود) اضافه می‌شود تا music/voiceover روی پیش‌نمایش تکی هم پخش شود. اگر کاربر فقط رفتار سکانس را بخواهد، این بخش حذف‌پذیر است.

## What does NOT change
- Final Film فقط با کلیک خود کاربر روی دکمه‌ی Final Film ساخته می‌شود و در Library سیو می‌شود (منطق فعلی).
- پایپ‌لاین `mergeVideos`، انتخاب soundtrackMode، ذخیره‌سازی و RLS بدون تغییر.
- بدون تغییر در Backend/DB.

## Verification
1. Upload یک فایل music → بلافاصله روی پیش‌نمایش سکانس صدا می‌آید؛ هیچ jobی برای Final Film ساخته نمی‌شود.
2. ساخت Voiceover و زدن Use as soundtrack → روی پیش‌نمایش پخش می‌شود؛ Final Film ساخته نمی‌شود.
3. کلیک روی Final Film → مانند قبل، merge انجام و در Library ذخیره می‌شود.
4. حذف music/voiceover → پخش پیش‌نمایش متوقف می‌شود.
5. Pause/Play/Prev/Next عملکرد درست با ادامه‌ی پخش soundtrack.
