## هدف
دکمه «START OVER» باید تمام state صفحه را به حالت اولیه برگرداند: پرامپت، فایل‌های آپلود، preview، خطاها، پیام‌های وضعیت، حالت پنل‌ها، و انتخاب‌های UI.

## وضعیت فعلی
دکمه (خطوط 1202–1212 در `DashboardPage.tsx`) فقط `resetComposer()` و `setPreviewVideoId(null)` را صدا می‌زند. پرامپت، آپلودها و پیام پاک می‌شود ولی حالت‌های دیگر مثل `composerError`, `videoColumnMessage`, `isApprovedPanelOpen`, `generationMode`, `durationSeconds`, `uploadTarget` دست‌نخورده می‌مانند.

## تغییر
در `src/modules/generator-ui/pages/DashboardPage.tsx`، `onClick` دکمه START OVER را به یک تابع کامل ریست‌کننده تغییر بده که این موارد را برمی‌گرداند:

- `setPromptText('')`
- `setUploadedFiles([])`
- `setPreviewVideoId(null)`
- `setComposerError(null)`
- `setVideoColumnMessage(null)`
- `setIsApprovedPanelOpen(false)`
- `setGenerationMode('image-to-video')` (پیش‌فرض)
- `setDurationSeconds(5)` (پیش‌فرض)
- `setUploadTarget('Start')` (پیش‌فرض)
- `setIsDragging(false)`

**عمداً ریست نمی‌کنیم**:
- `generatedVideos` و `mergedEntries` و `approvedIds` و `deletedIds` — اینها تاریخچه دائمی کاربر هستند و در پنل‌های History/Approved باید باقی بمانند. ریست‌کردنشان منجر به از دست رفتن کار قبلی کاربر می‌شود.
- `isSubmitting` — اگر در حال ارسال است، نباید بازنشانی شود تا متوقف نشود.

## محدوده تغییر
یک نقطه در `src/modules/generator-ui/pages/DashboardPage.tsx`، خطوط 1202–1212 (onClick دکمه Start over).

## اعتبارسنجی
1. کلیک روی START OVER وقتی پرامپت نوشته شده، فایل آپلود شده، یا خطا نمایش داده شده → همه پاک می‌شوند.
2. ویدئوهای ساخته‌شده در پنل‌های History و Approved دست‌نخورده می‌مانند.
3. حالت Image to Video / Text to Video به پیش‌فرض (Image to Video) برمی‌گردد.
4. مدت‌زمان به ۵ ثانیه برمی‌گردد.