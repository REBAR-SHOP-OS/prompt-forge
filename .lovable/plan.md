## هدف
حذف دائمی گزینه‌ی «Search music» از منوی دکمه‌ی Music.

## تغییر
در فایل `src/modules/generator-ui/pages/DashboardPage.tsx` آیتم منوی «Search music» (که با `window.open('https://pixabay.com/', ...)` به سایت بیرونی می‌رفت) به‌طور کامل حذف می‌شود.

بعد از حذف، منوی Music فقط شامل «Upload music from computer» خواهد بود.

## جزئیات فنی
- حذف بلوک `DropdownMenuItem` مربوط به Search music (خطوط ۶۲۲۷ تا ۶۲۳۴).
- اگر آیکون `Music` بعد از حذف بدون استفاده شد، بررسی می‌شود ولی چون در جای دیگری هم استفاده می‌شود، importها دست‌نخورده می‌ماند.
- بدون تغییر در منطق آپلود/دیتابیس.