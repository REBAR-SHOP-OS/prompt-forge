## هدف نهایی
بعد از Refresh صفحه، workspace نباید خالی شود یا به حالت خام برگردد. همان پروژه/کارت‌های جاری و Preview باید باقی بمانند. فقط دو عمل مجاز به پاک‌سازی یا reset هستند: **Final Film** و **Start Over**.

## تشخیص مشکل
در `DashboardPage.tsx` منطق hydrate فعلی قبل از اینکه manifestهای ذخیره‌شده کاملاً قابل اعتماد باشند، خروجی‌های backend را با `activeJobIds` و `activeImageIds` فیلتر می‌کند. اگر این setها در لحظه hydrate خالی باشند یا با state فعلی sync نشده باشند، کارت‌های جاری orphan تشخیص داده می‌شوند، UI خالی می‌شود یا حتی delete سمت سرور شروع می‌شود. همچنین اثر `pending-fresh-start` می‌تواند در بعضی refresh/sessionها `handleStartOver()` را اجرا کند و workspace را خام کند.

## برنامه اصلاح
1. **ساخت وضعیت hydration امن برای localStorage**
   - برای `activeJobIds`, `activeImageIds`, `projectSourceJobs`, `projectSourceImages`, `librarySavedJobs`, `mergedEntries` یک سیگنال/گارد آماده‌بودن اضافه می‌شود تا hydrate اصلی قبل از خوانده‌شدن storage تصمیم حذف/پاک‌سازی نگیرد.

2. **تغییر قانون hydrate بعد از Refresh**
   - Refresh فقط باید state جاری را restore کند.
   - hydrate دیگر نباید به‌خاطر خالی بودن موقت manifest، workspace را reset کند.
   - فقط آیتم‌هایی که قطعاً متعلق به پروژه جاری، Library snapshot، merged/final film یا saved library هستند نگه داشته می‌شوند؛ اما delete دائمی فقط وقتی انجام شود که کاربر Start Over زده باشد یا Final Film آن‌ها را از workspace خارج کرده باشد، نه صرفاً با Refresh.

3. **پایدار کردن Preview بعد از Refresh**
   - `previewState` باید بعد از آماده‌شدن لیست کارت‌ها اعمال شود تا Preview به خروجی جاری برگردد و صفحه خام نشود.
   - اگر `previewVideoId` ذخیره‌شده هنوز موجود است، همان نمایش داده شود؛ اگر موجود نبود، از کارت‌های فعال پروژه جاری انتخاب شود، نه از پروژه‌های دیگر.

4. **ایمن‌سازی fresh-start**
   - اجرای `pending-fresh-start` محدود به login واقعی می‌شود و روی Refresh معمولی اجرا نمی‌شود.
   - اگر flag قدیمی در localStorage مانده باشد، بدون reset خطرناک پاک/نادیده گرفته می‌شود مگر شواهد session تازه وجود داشته باشد.

5. **اعتبارسنجی**
   - مسیرهای زیر بررسی می‌شوند:
     - ساخت/وجود کارت جاری → Refresh → کارت و Preview باقی بماند.
     - Start Over → workspace خالی شود و loose items حذف شوند.
     - Final Film → sourceها فقط داخل پروژه Library باقی بمانند و loose نمایش داده نشوند.
     - باز کردن پروژه Library → فقط کارت‌های همان پروژه نمایش داده شوند.