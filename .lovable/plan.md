## هدف
افزودن یک دکمه آیکونی **Regenerate** (آیکون `RefreshCw` از lucide-react) در گوشه بالا-راست کادر «Reframed» در دیالوگ `ImageReframeDialog` تا کاربر بتواند بدون آپلود دوباره فایل، همان تصویر را با همان نسبت دوباره reframe کند.

## محل تغییر
فقط یک فایل frontend:
- `src/modules/generator-ui/components/ImageReframeDialog.tsx`

بدون تغییر در backend، بدون تغییر در `image-reframe` edge function، بدون تغییر در سایر کامپوننت‌ها.

## رفتار دکمه
- فقط زمانی نمایش داده می‌شود که `file` انتخاب شده باشد (یعنی چیزی برای regenerate وجود داشته باشد).
- در حالت `loading` غیرفعال می‌شود و آیکونش می‌چرخد.
- روی کلیک، دقیقاً همان منطق `handleConvert` فعلی را اجرا می‌کند (آپلود فایل فعلی + فراخوانی تابع `image-reframe` با همان `ratio`). نتیجه قبلی پاک و نتیجه جدید جایگزین می‌شود.
- یک toast کوتاه «Regenerating…» یا متن مشابه نمایش داده شود.

## جزئیات UI
- موقعیت: داخل ستون «Reframed» سمت راست، در همان ردیف با لیبل `Reframed (9:16)`.
- استایل: دکمه ghost کوچک (`size="icon"`, `variant="ghost"`)، با tooltip متنی «Regenerate».
- آیکون: `RefreshCw` از `lucide-react`، در حالت loading کلاس `animate-spin`.
- عدم بر هم زدن layout فعلی preview ها.

## ریسک و کنترل
- تغییر فقط presentational است؛ منطق business دست‌نخورده می‌ماند.
- بدون نیاز به migration، secret، یا deploy edge function.
