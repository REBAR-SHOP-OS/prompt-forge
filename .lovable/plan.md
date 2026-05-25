## مشکل

روی کارت‌هایی که از snapshot یک پروژه (selected-project / draft) رندر می‌شوند، کلیک روی آیکون قیچی (trim) کار نمی‌کند. علت:

- `setTrimmingJobId(video.id)` ست می‌شود
- ولی effect خط ۹۸۹ و render-guard خط ۴۱۰۴، job را فقط در `visibleVideos = mergedEntries + generatedVideos` جستجو می‌کنند
- اگر کلیپ live در `generatedVideos` موجود نباشد (مثلاً فقط از `draftSourceJobs`/`projectSourceJobs` رندر شده)، `find` `undefined` می‌شود → `trimSrc` ست نمی‌شود → دیالوگ باز نمی‌شود

## راه‌حل

در `src/modules/generator-ui/pages/DashboardPage.tsx`:

1. تابع `findJobByIdAcrossSnapshots(id)` اضافه می‌شود که job را به ترتیب از این منابع پیدا کند:
   - `generatedVideos`
   - `mergedEntries`
   - `Object.values(projectSourceJobs).flat()`
   - `Object.values(draftSourceJobs).flat()`
   - `Object.values(librarySavedJobs)`

2. در useEffect خط ۹۷۸ به‌جای `visibleVideos.find(...)` از این resolver استفاده می‌شود.
3. در رندر دیالوگ خط ۴۱۰۳–۴۱۱۴ همان resolver استفاده می‌شود.

هیچ تغییری در بک‌اند، edge functions، `applyTrimToCard`، یا سایر دکمه‌ها لازم نیست.

## فایل تغییر یافته

- `src/modules/generator-ui/pages/DashboardPage.tsx`

## اعتبارسنجی

- در حالت SHOWING PROJECT کلیک روی قیچی هر کارت Ready → دیالوگ ClipTrimmer باز می‌شود و ویدیو در آن لود می‌شود.
- در حالت پیش‌فرض (بدون پروژه‌ی انتخاب‌شده) رفتار قبلی حفظ می‌ماند.
- اعمال Trim و ذخیره به‌عنوان نسخه ویرایش‌شده طبق منطق فعلی کار می‌کند.
