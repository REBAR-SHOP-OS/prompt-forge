## هدف

گزینهٔ «Search music» (که کاربر را به Pixabay می‌برد) برای همیشه از منوی Music حذف شود.

## تغییرات (فقط `src/modules/generator-ui/pages/DashboardPage.tsx`)

- آیتم `DropdownMenuItem` مربوط به «Search music» (خطوط ۶۱۴۳–۶۱۵۰) که `window.open('https://pixabay.com/...')` را اجرا می‌کند حذف می‌شود.
- چون پس از حذف، تنها گزینهٔ باقی‌مانده «Upload music from computer» است، کل ساختار `DropdownMenu` ساده می‌شود: دکمهٔ «Music» مستقیماً `musicFileInputRef.current?.click()` را صدا می‌زند (بدون منوی کشویی).
- اگر بعد از حذف، import‌هایی مثل `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` یا آیکون `Music2` در جای دیگری استفاده نشوند، بدون تغییر باقی می‌مانند (فقط در صورت بلااستفاده شدن کامل پاک می‌شوند تا خطای lint ایجاد نشود).

## نتیجه
- منوی Music دیگر گزینهٔ جستجوی موزیک/Pixabay ندارد؛ کلیک روی Music مستقیماً پنجرهٔ آپلود فایل را باز می‌کند.