## مشکل
دکمه‌ی Download (آیکن کنار `9:16` در گوشه‌ی player) ویدیو را با `object-cover` (crop) دانلود می‌کند، در حالی‌که player اصلی با `object-contain` (letterbox مشکی) نمایش می‌دهد. کاربر می‌خواهد فایل دانلودی **دقیقاً مطابق نمایش روی صفحه** باشد.

## تغییر
### فایل: `src/modules/generator-ui/lib/downloadVideoAtRatio.ts`
- تابع `drawCover` (خط 76-88) → `drawContain`:
  - `Math.max(...)` → `Math.min(...)` (به‌جای پر کردن کامل، داخل فریم جای می‌گیرد)
  - بقیه‌ی منطق (center، fillRect مشکی) ثابت می‌ماند → نوارهای مشکی letterbox/pillarbox تولید می‌شوند.
- فراخوانی `drawCover()` در `tick()` به `drawContain()` تغییر می‌کند.

## نتیجه
خروجی دانلود (مثلاً برای 9:16) دقیقاً همان چیزی است که کاربر در player می‌بیند: کل ویدیو کامل در وسط با نوارهای مشکی در طرفین — بدون هیچ بریدگی.
