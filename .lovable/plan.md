## هدف نهایی
Draftها باید همیشه با thumbnail/preview واقعی نمایش داده شوند و وقتی روی Draft کلیک می‌شود، کلیپ‌های داخل آن در Pending/Working clips واقعاً برگردند و کارت‌ها خالی نباشند.

## تشخیص ریشه‌ای
- Draftها الان عمدتاً از `localStorage` ساخته می‌شوند و فقط یک `JobDetail` خلاصه برای کارت Library دارند.
- اگر اولین کلیپ Draft در لحظه snapshot هنوز `storage_path` نداشته باشد، خود کارت Draft با آیکن خالی ذخیره می‌شود؛ حتی اگر بعداً کلیپ‌های داخل `draftSourceJobs` مسیر ویدیو داشته باشند.
- هنگام باز کردن Draft، فقط snapshot موجود در `draftSourceJobs/draftSourceImages` به workspace برمی‌گردد؛ اگر snapshot ناقص یا stale باشد، Pending کارت خالی/بدون ویدیو نشان می‌دهد.
- تست مرورگر فعلی به صفحه login رسید؛ برای تست کامل تعاملی بعد از پیاده‌سازی باید با session preview شما یا endpointهای محافظت‌شده تست شود.

## برنامه اصلاح
1. **یک resolver واحد برای محتوای Draft بسازم**
   - برای هر Draft، بهترین منبع قابل نمایش را از این ترتیب انتخاب کند:
     1. کلیپ‌های واقعی داخل `draftSourceJobs` با `video.storage_path`
     2. تصاویر داخل `draftSourceImages`
     3. fallback قبلی خود Draft فقط اگر واقعاً مسیر معتبر داشته باشد
   - این resolver هم برای کارت Library و هم برای باز کردن Draft استفاده شود تا UI دو منبع حقیقت جدا نداشته باشد.

2. **کارت‌های Draft در Library را از snapshot واقعی بسازم**
   - thumbnail/preview کارت Draft از اولین کلیپ یا تصویر واقعی داخل Draft گرفته شود، نه الزاماً `draftEntry.video` قدیمی.
   - اگر Draft چند کلیپ دارد، clip count بر اساس snapshot معتبر نمایش داده شود.
   - Draftهایی که هیچ کلیپ/تصویر قابل استفاده ندارند، به جای کارت خالی، یا با state واضح “No playable clips” نمایش داده شوند یا از لیست حذف امن شوند؛ حذف خودکار destructive انجام نمی‌دهم مگر فقط داده‌ی placeholder بدون منبع واقعی باشد.

3. **Resume کردن Draft را مقاوم کنم**
   - هنگام کلیک روی Draft، فقط کلیپ‌های دارای `storage_path` و تصاویر دارای `storage_path` به workspace برگردند.
   - `workspaceHiddenJobIds` و `workspaceHiddenImageIds` برای همان منابع پاک شود.
   - `selectedProjectId` و preview state طوری تنظیم شود که Pending فوراً کلیپ‌های واقعی Draft را نشان دهد.

4. **Backfill/repair برای Draftهای قدیمی اضافه کنم**
   - یک effect سبک بسازم که Draft entryهای قدیمی را با snapshot معتبرشان هماهنگ کند.
   - اگر `draftEntry.video` خالی است ولی `draftSourceJobs` کلیپ معتبر دارد، همان کلیپ را به کارت Draft تزریق کند.
   - اگر thumbnail خالی است ولی video path وجود دارد، poster را optional نگه دارم اما خود video preview نمایش داده شود.

5. **تست و اعتبارسنجی**
   - با تست کد/مرورگر بررسی کنم که Library بدون crash رندر می‌شود.
   - با ابزار مرورگر تلاش می‌کنم Draft را باز کنم؛ اگر session نیاز به login داشت، تست UI محدود می‌شود ولی من با مسیرهای کد و داده‌ی local state تست منطقی می‌گیرم.
   - بعد از اصلاح، console/network را چک می‌کنم و اگر خطای جدیدی باشد همان‌جا رفع می‌کنم.

## فایل‌های هدف
- `src/modules/generator-ui/pages/DashboardPage.tsx`

## ریسک‌ها و محدودیت‌ها
- تغییری در دیتابیس یا backend لازم نیست؛ مشکل در بازسازی local draft و منطق UI است.
- حذف خودکار ویدیوها انجام نمی‌دهم تا داده‌های کاربر از بین نرود.
- اگر درفت‌های خیلی قدیمی در localStorage کاربر هیچ snapshot قابل بازیابی نداشته باشند، نمی‌شود ویدیوی واقعی از هیچ بازسازی کرد؛ اما UI دیگر کارت خالی گمراه‌کننده نشان نمی‌دهد و مسیرهای سالم درست کار می‌کنند.