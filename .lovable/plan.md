## مشکل
بعد از Apply کردن تغییرات Trim، کارت تاریخچه نسخه‌ی برش‌خورده را پخش می‌کند (چون از `getCardVideoSrc(id, storage_path)` استفاده می‌کند که `editedClips[id]?.url` را اولویت می‌دهد). اما پیش‌نمایش بزرگ مرکزی هنوز از `previewItem.job.video.storage_path` خام استفاده می‌کند، پس نسخه‌ی اصلی را نشان می‌دهد.

## راه‌حل
در تگ `<video>` پیش‌نمایش بزرگ، src به `getCardVideoSrc(previewItem.job.id, previewItem.job.video.storage_path)` تغییر کند تا اگر بلاب ادیت‌شده برای آن جاب وجود دارد، همان پخش شود. همچنین `key` به مقدار src وابسته شود تا با اعمال تغییرات، عنصر video دوباره mount شده و فریم اول از نسخه‌ی جدید لود شود.

## فایل
- `src/modules/generator-ui/pages/DashboardPage.tsx` (تگ video داخل پیش‌نمایش بزرگ، حدود خط 2343-2349)

## بدون ریسک
صرفاً تغییر منبع src؛ منطق edit/apply موجود دست‌نخورده.