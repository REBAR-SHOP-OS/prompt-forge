## هدف
تصویر ساخته‌شده با آیکون `Film Cover` باید فقط کاور همان پروژه باشد:
- خودش نباید Draft project جداگانه بسازد.
- نباید وارد Pending به‌عنوان کارت معمولی شود.
- اگر داخل یک Draft ساخته شده، بعد از `Final Film` باید همراه همان پروژه نهایی منتقل شود و در همان پروژه نمایش داده شود.
- تحت هیچ شرایطی نباید به Draft یا پروژه دیگری راه پیدا کند.

## ریشه مشکل
در `DashboardPage.tsx`، کاور در `coverImages[scopeId]` ذخیره می‌شود، اما همان رکورد تصویر در `userImages` هم اضافه می‌شود. چون روی آن `imageDraftMap` زده نمی‌شود و در `projectSourceImages` هم نیست، effect مربوط به historical/orphan backfill آن را «عکس آزاد» می‌بیند و برایش `draft-orphan-img-*` می‌سازد. همین باعث کارت Draft جداگانه در Library می‌شود.

مشکل دوم این است که هنگام تبدیل Draft به Final Film، فقط source images داخل `eligibleClips` به پروژه نهایی منتقل می‌شوند؛ اما Film Cover عمداً از `eligibleClips` حذف شده، پس mapping کاور از draftId به mergedId منتقل نمی‌شود.

## برنامه اصلاح

### 1. تعریف مالکیت مستقل برای Film Cover
در تمام logicهایی که عکس آزاد یا Draft orphan می‌سازند، `allCoverImageIds` به‌عنوان claimed/protected محسوب شود.

تغییرات اصلی:
- در backfill historical drafts، اگر `img.id` داخل `allCoverImageIds` بود، اصلاً `imageDraftMap` برای آن ساخته نشود.
- در legacy Final Film backfill، کاورها هرگز به `projectSourceImages` هیچ پروژه‌ای اضافه نشوند.
- در محاسبه `lockedRatio`، کاورها مثل source image معمولی حساب نشوند.

### 2. جلوگیری قطعی از Draft شدن کاور
برای تصویر ذخیره‌شده از حالت `aiDialogMode === 'cover'`:
- همچنان در `userImages` نگه داشته شود تا URL و metadata قابل دسترسی باشد.
- اما `markNewImage` برای آن صدا زده نشود.
- علاوه بر فیلتر فعلی `allCoverImageIds` در Pending، backfillهای draft/project هم آن را نادیده بگیرند.

### 3. انتقال کاور Draft به پروژه Final Film
در `handleMergeAllVideos`، وقتی یک Draft فاینال می‌شود:
- اگر `coverImages[selectedProjectId]` یا `coverImages[activeDraftId]` وجود داشت، همان کاور به `coverImages[mergedId]` منتقل شود.
- کلید قدیمی draft cover حذف شود تا کاور همان Draft بعد از فاینال به Draft ghost متصل نماند.
- اگر پروژه Final بلافاصله باز شد، `currentCover` باید از `coverImages[mergedId]` خوانده شود.

### 4. محافظت نمایشی در Pending و Library
- Pending همچنان source clips/images را نشان می‌دهد، اما Film Cover در بالای Pending فقط از `currentCover` خوانده می‌شود.
- Library/Drafts نباید هیچ Draftی بسازد که تنها محتوایش یک Film Cover باشد.

### 5. پاکسازی داده‌های آلوده قبلی
برای داده‌هایی که قبلاً خراب شده‌اند:
- یک guard در dedupe/backfill اضافه می‌شود تا Draftهای `draft-orphan-img-*` که source آن‌ها Film Cover است حذف و tombstone شوند.
- این باعث می‌شود کارت Draft اشتباهی که فقط از کاور ساخته شده، بعد از refresh/اجرای app دیگر برنگردد.

## فایل‌های درگیر
- `src/modules/generator-ui/pages/DashboardPage.tsx`

## تست پذیرش
1. داخل یک Draft با آیکون Film Cover عکس بسازید.
2. نباید در Library یک Draft project جدا فقط برای آن عکس ساخته شود.
3. Draft را Final Film کنید.
4. کاور باید در همان Final Film نمایش داده شود.
5. کاور نباید در Pending پروژه دیگر، Draft دیگر، یا Workspace آزاد ظاهر شود.
6. اگر داده آلوده قدیمی وجود داشته باشد، Draft ghost مربوط به کاور باید حذف شود و برنگردد.