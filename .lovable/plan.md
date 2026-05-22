## مشکل ریشه‌ای

با کلیک روی هر کارت در Library، state درست ست می‌شود (`previewVideoId` و `selectedProjectId`)، اما در `previewItem` (DashboardPage.tsx خط ۱۴۸۲) بالاترین اولویت با `lastMergedPreview` است. این یعنی هر وقت آخرین Final Film هنوز در state باشد، **پیش‌نمایش روی همان آخرین خروجی قفل می‌ماند** و انتخاب کاربر در Library نادیده گرفته می‌شود.

علاوه بر این، در `onClick` کارت‌های Library (خط ۴۶۹۵ و ۴۷۰۳)، `setSelectedProjectId` فقط برای آیتم‌هایی که id آن‌ها با `merged-` شروع می‌شود ست می‌شود. کارت‌های Library که از یک کلیپ تکی ذخیره شده‌اند (مثل "Final clip — soundtrack applied") id اصلی job را دارند، پس `selectedProjectId` به `null` می‌رود و کارت‌های منبع در پنل راست به‌جای آن پروژه، کل workspace را نشان می‌دهند.

## تغییرات (فقط در `src/modules/generator-ui/pages/DashboardPage.tsx`)

۱. **پاک کردن `lastMergedPreview` هنگام کلیک روی هر کارت Library**  
   در هر دو هندلر `onClick` و `onKeyDown` کارت Library، قبل از ست کردن preview، `setLastMergedPreview(null)` فراخوانی شود تا preview واقعاً به آن پروژه‌ی کلیک‌شده سوییچ کند.

۲. **ست کردن `selectedProjectId` برای همه‌ی کارت‌های Library**  
   شرط `video.id.startsWith('merged-') ? video.id : null` حذف و به‌سادگی `setSelectedProjectId(video.id)` ست شود. این کار باعث می‌شود برای پروژه‌های تک‌کلیپی ذخیره‌شده هم پنل سمت راست فقط کارت‌های همان پروژه را نشان دهد.

۳. **پشتیبانی `displayedClips`/`displayedImages` از پروژه‌های غیر-merged**  
   منطق `displayedClips` (خط ۱۳۳۵-۱۳۸۷) و `displayedImages` (خط ۱۴۱۹-۱۴۲۹) که از `projectSourceJobs[selectedProjectId]` می‌خواند — برای کارت تک‌کلیپی Library snapshot وجود ندارد. اضافه شود: اگر `selectedProjectId` وجود دارد ولی snapshot ندارد و خود آن id یک job ذخیره‌شده در `librarySavedJobs` است، آن یک job به‌تنهایی به‌عنوان منبع نمایش داده شود (و سایر کلیپ‌ها فیلتر شوند، دقیقاً مانند رفتار فعلی برای پروژه‌های merged).

۴. **قفل preview برای پروژه‌ی تک‌کلیپ**  
   منطق فعلی در `previewItem` (خط ۱۵۱۴) که می‌گوید «اگر `selectedProjectId` ست است، preview را روی آن قفل کن» را برای حالت تک‌کلیپ هم نگه دار — چون id در `visibleVideos`/`librarySavedJobs` پیدا می‌شود نیازی به تغییر اضافی نیست، فقط مطمئن می‌شویم با حذف `lastMergedPreview` به این شاخه می‌رسد.

## فایل‌های درگیر

- `src/modules/generator-ui/pages/DashboardPage.tsx` (تنها فایل)

## ریسک

- تغییر کاملاً UI/state-level است، هیچ نوشتنی روی backend ندارد.
- پاک کردن `lastMergedPreview` فقط هنگام کلیک کاربر اتفاق می‌افتد؛ جریان ساخت Final Film و ذخیره در Library دست‌نخورده می‌ماند.
- رفتار قبلی (که Final Film تازه‌ساخته بالای همه نمایش داده شود) همچنان تا قبل از اولین کلیک کاربر روی Library حفظ است.
