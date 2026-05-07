فرضیه جدید ریشه‌ای: مشکل دیگر از عکس‌ها نیست؛ کلیپ‌های ثابتِ ساخته‌شده از عکس با موفقیت در باکت `merged-videos` آپلود می‌شوند، اما باکت در دیتابیس فعلی private است و کد همچنان از URL عمومی `/object/public/merged-videos/...` برای پخش در مرورگر استفاده می‌کند؛ به همین دلیل `<video>` در مرحله Final Film نمی‌تواند فایل تازه آپلودشده را load کند.

شواهدی که بررسی شد:
- درخواست آپلود still clip به `merged-videos/...webm` با status 200 موفق بوده است.
- خطای کنسول دقیقاً روی load همین فایل تازه آپلودشده رخ داده: `Failed to load video: .../object/public/merged-videos/...still-....webm`.
- وضعیت زنده دیتابیس نشان می‌دهد `merged-videos` برابر `public=false` است، در حالی که کد از `getPublicUrl()` استفاده می‌کند.
- `user-images` اکنون public است و thumbnails کار می‌کنند؛ بنابراین این خطای جدید مربوط به مرحله بعدی یعنی still-video های میانی در `merged-videos` است.

برنامه رفع ریشه‌ای:

1. اصلاح قطعی دسترسی `merged-videos`
   - یک migration اضافه می‌کنم که `merged-videos` را دوباره و به‌صورت idempotent public کند:
     - `UPDATE storage.buckets SET public = true WHERE id = 'merged-videos';`
   - policy خواندن عمومی `merged-videos` را هم با `DROP POLICY IF EXISTS` و `CREATE POLICY` پایدار می‌کنم تا URLهای عمومی که اپلیکیشن تولید می‌کند واقعاً قابل پخش باشند.
   - policyهای upload/update/delete مالک‌محور باقی می‌مانند تا فقط کاربر بتواند در فولدر خودش فایل بسازد یا حذف کند.

2. مقاوم‌سازی کد در برابر تغییر public/private باکت
   - در `src/modules/generator-ui/lib/proxiedVideoUrl.ts` منطق فعلی که URLهای storage خود پروژه را بدون proxy برمی‌گرداند اصلاح می‌شود.
   - برای URLهای storage مربوط به `merged-videos`، خروجی همیشه از `video-proxy` عبور داده می‌شود، حتی اگر host مربوط به storage خود پروژه باشد.
   - این باعث می‌شود اگر در آینده باکت دوباره private شد یا CORS/metadata مشکل داشت، Final Film همچنان از مسیر احراز هویت‌شده و CORS-safe استفاده کند.

3. اصلاح تمام نقاطی که still clip آپلود می‌کنند
   - در `DashboardPage.tsx`، بعد از آپلود still clipهای ساخته‌شده از عکس در Final Film، URL استفاده‌شده برای merge از helper امن عبور داده می‌شود.
   - همین الگو برای Start/End append/prepend هم بررسی و هماهنگ می‌شود تا همه مسیرهای merge یک رفتار واحد داشته باشند.

4. پیام خطای دقیق‌تر برای خطاهای آینده
   - اگر load ویدیو شکست بخورد، پیام داخلی شامل نوع منبع مشکل‌دار می‌شود تا دیگر خطای مبهم «try again» نمایش داده نشود.
   - پیام کاربر همچنان ساده می‌ماند، اما لاگ‌ها برای تشخیص ریشه‌ای بعدی دقیق‌تر خواهند بود.

5. اعتبارسنجی پس از اعمال
   - وضعیت باکت `merged-videos` را دوباره از دیتابیس می‌خوانم و public بودن آن را تایید می‌کنم.
   - کد مسیر Final Film را بررسی می‌کنم تا مطمئن شوم URLهای `merged-videos` دیگر مستقیم و شکننده استفاده نمی‌شوند.
   - تست دستی سناریو مورد نظر: عکس‌های آپلودشده → Final Film → ساخته‌شدن کلیپ‌های still → merge بدون خطای load.

فایل‌های مورد انتظار برای تغییر:
- `supabase/migrations/...sql`
- `src/modules/generator-ui/lib/proxiedVideoUrl.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx`