## مشکل

پس از Final Film، کاربر اگر بعداً روی همان پروژه از Library کلیک کند، `selectedProjectId` ست می‌شود و:
- HISTORY فقط snapshot منجمد source-clipهای آن پروژه را نشان می‌دهد.
- اگر کاربر کارت جدید (تولید/آپلود ویدیو/تصویر) اضافه کند، چون در حالت `selectedProjectId` هستیم، کارت جدید در `displayedVideos` فیلتر می‌شود و دیده **نمی‌شود**.
- دکمه Final Film هم بر اساس `completedSourceVideos` از `generatedVideos` فعلی (که خالی است) کار می‌کند، پس غیرفعال است (مثل اسکرین‌شات).

نتیجه: کاربر نمی‌تواند پروژه قبلی را گسترش دهد یا یک Final Film دوم بسازد.

## هدف

وقتی کاربر در حالت «Showing project» قرار دارد و می‌خواهد کارت جدید اضافه کند یا Final Film را دوباره بزند، workspace باید زنده شود: source-clipهای پروژه به workspace بازگردند، خروج از project-snapshot mode انجام شود، و ادامه کار طبیعی باشد.

## تغییرات — فقط Frontend (`DashboardPage.tsx`)

### 1) تابع `resumeSelectedProject()`
یک helper که این کارها را انجام می‌دهد:
- اگر `selectedProjectId` set است:
  - source-clipهای snapshot (`projectSourceJobs[selectedProjectId]`) را در `generatedVideos` ادغام کند (همان `mergeJob` موجود) تا کارت‌های قدیمی به workspace برگردند.
  - این idها را از `workspaceHiddenJobIds` حذف کند تا قابل دیدن شوند.
  - `setSelectedProjectId(null)` تا از حالت snapshot خارج شویم.
  - `setPreviewDismissed(true)` و `setPreviewVideoId(null)` تا preview merged video بسته شود.

### 2) فراخوانی خودکار هنگام افزودن کارت جدید
نقاطی که کارت جدید به HISTORY اضافه می‌شود → قبل از insert، `resumeSelectedProject()` صدا زده شود:
- `handleSubmit` (تولید جدید، خط ~1529) — قبل از ست‌کردن `seededJob`.
- `handleUploadVideoFile` (آپلود ویدیو به‌عنوان کارت).
- `handleImageSelected` (آپلود تصویر).

### 3) دکمه Final Film در حالت پروژه
Final Film باید قابل کلیک باشد حتی وقتی پروژه باز است:
- محاسبه `completedSourceVideos` و `visibleUserImages` از `displayedVideos` (که در حالت پروژه برابر snapshot است) صورت گیرد یا، ساده‌تر:
- در `handleMergeAllVideos`، اگر `selectedProjectId` set است، اول `resumeSelectedProject()` صدا زده شود (snapshot به workspace بازگردد)، سپس merge ادامه یابد. شرط `disabled` دکمه هم آپدیت شود تا تعداد کارت‌های قابل ادغام را در حالت پروژه از روی snapshot+تصاویر بشمارد.

### 4) Showing-project banner
دکمه «X» بستن banner همچنان `setSelectedProjectId(null)` ساده می‌ماند (بدون restore، چون کاربر فقط قصد بستن دارد). اما اگر در حالت پروژه روی کارتی در HISTORY کلیک شود برای ویرایش (trim/cut)، رفتار فعلی دست‌نخورده می‌ماند.

## خارج از scope

- بدون تغییر در backend، RPCها، یا migration.
- بدون تغییر در ذخیره‌سازی snapshot یا ساختار merged-videos.
- بدون تغییر در soundtrack/voiceover persistence.

## تأیید

- ورود → کلیک روی Library → پروژه قدیمی نشان داده می‌شود.
- یک ویدیو/تصویر جدید تولید/آپلود می‌شود → workspace به حالت زنده برمی‌گردد، همه source-clips قبلی + کارت جدید کنار هم در HISTORY دیده می‌شوند، Final Film فعال می‌شود.
- کلیک Final Film → یک merged video جدید ساخته می‌شود (پروژه جدید) و در Library به‌عنوان آیتم جداگانه ذخیره می‌شود. آیتم اولیه دست‌نخورده باقی می‌ماند.
