## وضعیت تأییدشده

- مسیر فعال: `/#/app`
- فایل بررسی‌شده: `src/modules/generator-ui/pages/DashboardPage.tsx`
- بخش‌های بررسی‌شده:
  - `visibleUserImages`
  - `displayedVideos`
  - `handleMergeAllVideos`
  - `resumeSelectedProject`
  - `resetWorkspace`
  - snapshotهای `projectSourceImages` / `draftSourceImages`
  - backfill legacy برای پروژه‌های قدیمی

## علت محتمل باگ

فیلتر قبلی برای نمایش و Final Film بهتر شده، اما هنوز یک مسیر خطرناک باقی مانده:

1. وقتی یک Draft انتخاب شده و Final Film می‌شود، اسنپ‌شات عکس‌های همان Draft باید فقط از `imageSnapshotForMerge` ساخته شود.
2. اما بعد از ساخت Final Film، state و localStorage مربوط به عکس‌ها/درفت‌ها در چند effect همزمان دوباره محاسبه می‌شود.
3. مسیر legacy/backfill پروژه‌های Final Film قدیمی هنوز می‌تواند برای پروژه‌هایی که snapshot تصویر ندارند، عکس‌های قدیمی‌تر از زمان Final Film را به `projectSourceImages` بچسباند.
4. این یعنی یک عکس متعلق به Draft دیگر، اگر زمان ساختش قبل از Final Film باشد و هنوز در localStorage/userImages وجود داشته باشد، ممکن است به عنوان منبع پروژه‌ی جدید ثبت یا در Pending نمایش داده شود.

این باگ باید از دو طرف بسته شود: هم هنگام ساخت Final Film، snapshot منبع باید قفل‌شده و دقیق باشد؛ هم backfill نباید هیچ عکسِ دارای مالکیت درفت دیگر را وارد پروژه‌ی Final کند.

## طرح اصلاح

### 1. قفل کردن scope عکس‌ها برای Final Film
در `handleMergeAllVideos`، قبل از merge یک set قطعی از آیتم‌های مجاز می‌سازم:

- اگر پروژه/درفت انتخاب شده باشد:
  - فقط آیتم‌های داخل snapshot همان `selectedProjectId` مجاز هستند.
  - هیچ آیتمی از `visibleUserImages` یا `userImages` کلی وارد نمی‌شود.
- اگر workspace آزاد باشد:
  - فقط `activeImageIds` و `activeJobIds` مجاز هستند.
  - آیتم‌های موجود در هر draft/project دیگر حذف می‌شوند.

### 2. پاک‌سازی مالکیت درفت بعد از Final Film
بعد از موفقیت Final Film:

- عکس‌ها و ویدئوهایی که واقعاً در `eligibleClips` بوده‌اند به `projectSourceImages[mergedId]` و `projectSourceJobs[mergedId]` منتقل می‌شوند.
- همان آیتم‌ها از draft snapshots مربوط به draft فاینال‌شده حذف می‌شوند.
- `imageDraftMap` و `jobDraftMap` فقط برای همان آیتم‌های منتقل‌شده پاک یا بازنشانی می‌شوند تا بعداً backfill آن‌ها را به draft اشتباه برنگرداند.
- آیتم‌هایی که متعلق به draftهای دیگر هستند دست‌نخورده باقی می‌مانند.

### 3. امن‌سازی legacy backfill
در effect مربوط به backfill `projectSourceImages` برای Final Filmهای قدیمی:

- عکس‌هایی که در `imageDraftMap` مالکیت draft دارند، وارد پروژه‌ی Final Film دیگری نشوند.
- عکس‌هایی که در `draftSourceImages` هر draft دیگری وجود دارند، وارد snapshot پروژه‌ی Final نشوند.
- فقط عکس‌های واقعاً آزاد/legacy و بی‌مالکیت قابل backfill باشند.

### 4. اصلاح قفل نسبت تصویر
در `lockedRatio`، فیلتر `liveImages` باید مثل `visibleUserImages` از `activeImageIds` استفاده کند. الان این بخش هنوز عکس‌های غیر-active را در محاسبه نسبت پروژه لحاظ می‌کند و می‌تواند نشانه‌ای از نشت state باشد.

### 5. اعتبارسنجی دستی بعد از پیاده‌سازی
بعد از اعمال تغییرات، این سناریو باید پاس شود:

1. یک Draft با یک عکس بسازید و آن را Final Film نکنید.
2. وارد Draft دیگر شوید یا یک Draft جدید بسازید.
3. Draft دوم را Final Film کنید.
4. در Pending پروژه Final شده، فقط کارت‌های مربوط به همان Draft دوم نمایش داده شوند.
5. عکس Draft اول نه در Pending پروژه دوم و نه در snapshot پروژه دوم دیده شود.
6. باز کردن Draft اول همچنان عکس خودش را نشان دهد.

## فایل‌هایی که تغییر می‌کنند

- `src/modules/generator-ui/pages/DashboardPage.tsx`
- در صورت نیاز، فقط به‌روزرسانی مستندات برنامه: `.lovable/plan.md`

## ریسک باقی‌مانده

- داده‌های قدیمی localStorage که قبلاً snapshot اشتباه ساخته‌اند ممکن است از قبل آلوده شده باشند. برای این مورد یک guard اضافه می‌کنم تا از این به بعد snapshotهای جدید درست ساخته شوند و نمایش Pending بر اساس scope صحیح فیلتر شود.