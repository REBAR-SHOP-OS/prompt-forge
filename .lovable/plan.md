## هدف

آیکون `+` بالای ستون Pending (خط 3620-3627 در `DashboardPage.tsx`) دیگر کارت جدید اضافه نکند؛ به جای آن **Live preview ترتیبی همه کارت‌های پروژه فعلی** را در پلیر مرکزی فعال کند.

## رفتار جدید

- کلیک روی آیکون:
  1. `setPreviewDismissed(false)` — اگر پلیر بسته شده باز شود.
  2. `setPreviewVideoId(null)` — قفل تک‌کلیپی برداشته شود تا منطق موجود `previewItem` (خط 1390-1430) به‌صورت خودکار به حالت `{ kind: 'sequence', clips: playableSequenceClips }` برود و همه کارت‌ها پشت‌سرهم پخش شوند.
- اگر `playableSequenceClips.length === 0` باشد، toast کوتاه: «کلیپ آماده‌ای برای Live preview وجود ندارد».
- اگر فقط یک کلیپ playable باشد، همان تک‌کلیپ پخش می‌شود (رفتار موجود `previewItem`).

## تغییرات UI

- آیکون `Plus` → `PlayCircle` (یا `Play`) از `lucide-react`.
- `aria-label` و `title`: `Live preview all cards`.
- استایل دکمه بدون تغییر (همان دایره ۸×۸).

## محدوده

- فقط فایل `src/modules/generator-ui/pages/DashboardPage.tsx`.
- تابع `handleAddVideoCard` حذف نمی‌شود (ممکن است جای دیگری استفاده شود) — فقط onClick این دکمه عوض می‌شود. در صورت بدون‌مصرف بودن، حذف می‌گردد.
- بدون تغییر backend، بدون تغییر منطق Pending/Library/Final Film.

## تأیید

- کلیک روی + با ۲+ کلیپ آماده → پلیر مرکزی sequence همه کلیپ‌ها را پخش کند.
- کلیک با ۰ کلیپ آماده → toast.
- رفرش صفحه و رفتار Pending/Final Film/Start Over بدون تغییر باقی بماند.
