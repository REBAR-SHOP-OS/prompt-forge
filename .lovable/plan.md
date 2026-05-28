## مشکل

در Library یک کارت Draft با برچسب "1 clip" دیده می‌شود ولی وقتی باز می‌شود، در محیط کار هیچ کارتی نیست.

## ریشه‌ی مشکل

در `src/modules/generator-ui/pages/DashboardPage.tsx`:

- مسیر حذف کلیپ ویدیو (`handleDeleteJob` حدود خط 1453) به‌درستی `draftSourceJobs` را پاک می‌کند و هر Draft خالی را از `draftEntries` حذف و در `deletedDraftIds` ثبت می‌کند.
- اما مسیر حذف تصویر آپلودی (`handleDeleteUserImage` خط 2493) فقط `projectSourceImages` را پاک می‌کند و **هیچ‌گاه `draftSourceImages` و `draftEntries` را به‌روزرسانی نمی‌کند**.

نتیجه: وقتی کاربر تصویری را حذف می‌کند که یک Draft (مثلاً `draft-orphan-img-<id>` یا Draft فعال) فقط همان تصویر را به‌عنوان منبع داشت:
- تصویر از `userImages` حذف می‌شود.
- ولی `draftSourceImages[did]` و `draftEntries` هنوز ارجاع کهنه دارند.
- در Library، `clipCount` همچنان از روی همان snapshot کهنه ۱ نمایش داده می‌شود.
- با باز کردن Draft، `visibleUserImages` تلاش می‌کند تصویر را نمایش دهد ولی منبع پاک شده و کارت یا خالی است یا اصلاً رندر نمی‌شود.

## راه‌حل

اصلاح `handleDeleteUserImage` به‌گونه‌ای که با منطق حذف کلیپ هم‌خوان شود:

۱. علاوه بر پاک‌سازی `projectSourceImages`، از همه‌ی کلیدهای `draftSourceImages` نیز این `imageId` حذف شود و وضعیت persist شود.
۲. پس از این پاک‌سازی، برای هر `did` که هم `draftSourceJobs[did]` و هم `draftSourceImages[did]` خالی شد:
   - آن ورودی از `draftEntries` حذف شود (و persist شود).
   - شناسه‌اش به `deletedDraftIds` افزوده شود تا effect مربوط به Backfill (خط 1832) دوباره آن را به‌عنوان `draft-orphan-img-*` بازنسازی نکند.
۳. اگر Draft حذف‌شده همان `activeDraftId` بود، `activeDraftId` پاک شود تا workspace به حالت تازه برگردد.
۴. اگر `selectedProjectId` همان Draft بود، روی `null` تنظیم شود.

## فایل‌های تغییریافته

- `src/modules/generator-ui/pages/DashboardPage.tsx` — فقط تابع `handleDeleteUserImage` (حدود خط 2493).

## اعتبارسنجی

- آپلود یک تصویر، سپس حذف آن → دیگر کارت Draft خالی در Library نباید باقی بماند.
- پس از رفرش صفحه نیز Draft خالی نباید دوباره ظاهر شود (به‌دلیل tombstone).
- Draftهای دارای تصویر + کلیپ ویدیویی همچنان درست کار کنند (فقط در صورت خالی‌شدن کامل حذف شوند).
