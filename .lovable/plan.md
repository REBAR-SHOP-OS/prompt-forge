# جلوگیری از نمایش تصویر «Choose from products» به‌صورت Draft

## مشکل چیست و از کجا می‌آید
وقتی در Product Ad → «Choose from products» یک محصول انتخاب می‌شود، تابع `pickProduct` در `ProductAdDialog.tsx` تصویر را reframe می‌کند و یک ردیف در جدول `generator_user_images` با `category: 'reframe'` ثبت می‌کند (همان «Previously made images» + استورج). این رفتار درست است و باید بماند.

اما در `DashboardPage.tsx`، هنگام بازیابی workspace (خطوط ۴۶۰۸–۴۶۳۶)، فقط تصاویر `product` و `character` فیلتر می‌شوند و تصاویر `reframe` وارد state به نام `userImages` می‌شوند. سپس افکت‌های backfill/grouping (خطوط ۳۵۶۰ و ۳۷۱۹) هر تصویر داخل `userImages` را به یک Draft تبدیل می‌کنند — و به همین دلیل تصویر ساخته‌شده در «Choose from products» به‌شکل یک «Draft project» (همان دایرهٔ سفید در عکس) در Library ظاهر می‌شود.

## راه‌حل (فقط فرانت‌اند، بدون migration و بدون تغییر استورج)
تصاویر `reframe` باید مثل `product`/`character` از workspace و drafts کنار گذاشته شوند، اما در «Previously made images» و Storage دست‌نخورده باقی بمانند.

۱. **حذف reframe از بازیابی workspace** در `DashboardPage.tsx`:
   - در کوئری خط ~۴۶۱۶، شرط `.or(...)` به‌گونه‌ای اصلاح شود که دستهٔ `reframe` هم استثنا شود.
   - در فیلتر خطوط ~۴۶۳۰–۴۶۳۵، شرط `(r.category ?? 'general') !== 'reframe'` اضافه شود تا تصاویر reframe وارد `userImages` نشوند.

۲. **گارد دفاعی در دو افکت Draft** (برای اطمینان از اینکه هیچ مسیر دیگری reframe را به draft تبدیل نکند):
   - در حلقهٔ grouping (خط ~۳۵۶۱) و حلقهٔ backfill (خط ~۳۷۱۹)، اگر `(img.category ?? 'general') === 'reframe'` بود، آن تصویر نادیده گرفته شود.

## آنچه تغییر نمی‌کند
- `pickProduct` و ثبت در «Previously made images» و استورج: بدون تغییر.
- تب Storage و گالری «Previously made images»: همچنان تصاویر reframe را نشان می‌دهند.
- منطق آپلود و ساخت ویدئو/کلیپ: بدون تغییر.

## بخش فنی
- فایل: `src/modules/generator-ui/pages/DashboardPage.tsx` (خطوط ~۴۶۱۶، ~۴۶۳۰–۴۶۳۵، ~۳۵۶۱، ~۳۷۱۹).
- بدون تغییر دیتابیس، باکت‌ها یا edge functionها.

## اعتبارسنجی
- typecheck.
- با Playwright روی پیش‌نمایش لوکال: یک محصول از «Choose from products» انتخاب می‌شود؛ تأیید می‌شود که (الف) در Library هیچ «Draft project» جدیدی ساخته نمی‌شود، و (ب) همان تصویر در «Previously made images» و Storage دیده می‌شود.
