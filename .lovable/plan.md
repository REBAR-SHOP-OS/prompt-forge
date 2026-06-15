هدف: حذف برچسب «Live preview» از روی پیش‌نمایش ویدئو (یک تغییر UI ساده).

محدوده: فقط frontend، حذف عنصر badge.

برنامه اجرا:
1. در `VideoWithSoundtrack.tsx` (خط ۱۱۳-۱۱۵) عنصر `<span>...Live preview</span>` حذف می‌شود.
2. در `SequentialClipPlayer.tsx` (حدود خط ۵۱۴) همان badge «Live preview» حذف می‌شود تا در پیش‌نمایش چندکلیپی هم نمایش داده نشود.

اعتبارسنجی: بررسی بصری پیش‌نمایش که دیگر متن «Live preview» دیده نمی‌شود.