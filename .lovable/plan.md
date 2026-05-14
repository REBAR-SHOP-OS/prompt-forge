## نتیجه مورد انتظار

ستون سمت راست دیگر «History» نیست؛ نام و مفهوم آن «Pending» است. هیچ پیام «Syncing render history» نمایش داده نمی‌شود و هیچ کارت قدیمی از backend/localStorage به عنوان تاریخچه وارد UI نمی‌شود. فقط کارت‌های پروژه کاری فعلی داخل Pending دیده می‌شوند؛ بعد از **Final Film** یا **Start Over** کارت‌های موقت از Pending خارج و فایل/رکوردهای غیرنهایی برای همیشه حذف می‌شوند. خروجی نهایی فقط در Library باقی می‌ماند.

## مشکل دقیق در کد فعلی

در `DashboardPage.tsx` روی mount این مسیر اجرا می‌شود:

- `jobOrchestratorGateway.listMyJobs()`
- `hydrateJobs(...)`
- query مستقیم از `generator_user_images`
- سپس `setGeneratedVideos(hydrated)` و `setUserImages(imgRows)`

یعنی هر چیزی که قبلاً در backend به عنوان job/image مانده، دوباره وارد ستون «History / Recent outputs» می‌شود. متن `Syncing render history` هم از همان وضعیت `isLibraryLoading` نمایش داده می‌شود.

## برنامه اصلاح

1. **تغییر مفهوم UI از History به Pending**
   - آیکن/تیتر/aria-label ستون سمت راست از `History`, `Recent outputs`, `Video renders` به مفهوم `Pending` تغییر می‌کند.
   - شمارنده ستون بر اساس همه کارت‌های Pending محاسبه می‌شود، نه فقط ویدئوها.
   - متن `Syncing render history` و loader مربوط به تاریخچه حذف می‌شود؛ Pending هیچ‌وقت حالت sync history نشان نمی‌دهد.

2. **قطع کامل نمایش کارت‌های تاریخچه‌ای**
   - hydrate فعلی که `listMyJobs()` و همه `generator_user_images` را مستقیم وارد state می‌کند حذف/بازنویسی می‌شود.
   - بعد از refresh، فقط IDهایی که در manifest پروژه کاری فعلی هستند (`workspace-active-jobs`, `workspace-active-images`) اجازه ورود به Pending دارند.
   - اگر manifest خالی باشد، Pending خالی می‌ماند و هیچ کارت قدیمی از backend برای نمایش restore نمی‌شود.

3. **پاک‌سازی دائمی کارت‌های لو رفته بدون نمایش در UI**
   - یک cleanup خاموش و امن اجرا می‌شود: همه job/imageهای backend بررسی می‌شوند، اما هرگز قبل از فیلتر وارد UI نمی‌شوند.
   - هر job/image که جزو Pending فعال فعلی نباشد، orphan محسوب شده و با APIهای موجود حذف دائمی می‌شود:
     - ویدئو: `jobOrchestratorGateway.deleteJob(id)`
     - عکس: `generatorUiGateway.deleteUserImage(id)`
   - در صورت خطای حذف، کارت به UI برنمی‌گردد؛ فقط خطای قابل‌ردگیری در console ثبت می‌شود تا دوباره leak نشود.

4. **Final Film فقط Library را نگه می‌دارد**
   - بعد از ساخت Final Film، خروجی نهایی در Library باقی می‌ماند.
   - کارت‌های source که داخل Pending بودند از active manifest حذف می‌شوند و سپس به صورت دائمی پاک می‌شوند؛ دیگر به عنوان source-history/snapshot در ستون Pending ذخیره یا نمایش داده نمی‌شوند.
   - `projectSourceJobs` و `projectSourceImages` دیگر برای بازگرداندن کارت‌های قبلی به Pending استفاده نمی‌شوند؛ Library فقط خروجی نهایی پروژه را نشان می‌دهد.

5. **Start Over پاک‌سازی قطعی Pending**
   - Start Over فقط کارت‌های فعال Pending را هدف می‌گیرد.
   - active manifestها، preview، composer، uploaded/pending state پاک می‌شوند.
   - همه job/imageهای Pending با delete API حذف دائمی می‌شوند تا بعد از refresh برنگردند.

6. **حذف رفتار fresh-start خطرناک**
   - flag قدیمی `pending-fresh-start` دیگر باعث hydrate/reset مبهم نمی‌شود.
   - اگر flag باقی مانده باشد فقط پاک می‌شود، نه اینکه باعث نمایش یا sync کارت‌های قبلی شود.

## محدودیت‌های ایمنی

- فایل‌های نهایی Library و merged final film حذف نمی‌شوند.
- حذف دائمی فقط برای کارت‌های موقت Pending / orphan انجام می‌شود.
- هیچ schema یا جدول جدیدی لازم نیست؛ از APIهای delete موجود استفاده می‌شود.
- قبل از ادعای تکمیل، مسیرهای refresh، Start Over، Final Film و باز شدن Library بررسی می‌شوند.