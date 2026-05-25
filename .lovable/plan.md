## مشکل

وقتی روی آیکون سطل آشغال یک کارت کلیک می‌کنید و در دیالوگ تایید می‌کنید:

1. درخواست `jobs-delete` به سرور می‌رود و با `ok: true` پاسخ می‌گیرد (ردیف Job و فایل ویدیو در بک‌اند واقعاً حذف می‌شود).
2. در فرانت‌اند، `deleteCard` کارت را به‌صورت optimistic از `generatedVideos` حذف می‌کند.
3. ولی چون پنل سمت‌راست در حالت «SHOWING PROJECT» است، لیست Working clips از روی snapshot ساخته می‌شود نه از `generatedVideos`. در `displayedVideos` اگر `selectedProjectId` یک draft باشد، از `draftSourceJobs[selectedProjectId]` خوانده می‌شود — و این snapshot هنوز کلیپ حذف‌شده را دارد، پس کارت بلافاصله دوباره ظاهر می‌شود.

`deleteCard` فقط `projectSourceJobs` و `projectSourceImages` را تمیز می‌کند و `draftSourceJobs` / `draftSourceImages` فراموش شده‌اند.

## راه‌حل

فقط در `src/modules/generator-ui/pages/DashboardPage.tsx` داخل تابع `deleteCard` (مسیر non-draft، حدود خط 1249–1271) دو prune مشابه برای snapshotهای draft هم اضافه می‌شود:

- روی `draftSourceJobs` لوپ بزن و در هر آرایه، کلیپ با `id === jobId` را حذف کن، سپس `setDraftSourceJobs` + `persistDraftSourceJobs`.
- روی `draftSourceImages` همان کار را برای حالت merged انجام بده (مشابه بلوک موجود `projectSourceImages`).
- اگر بعد از prune، یک draft هیچ کلیپ/تصویری نداشت، آن draft از `draftEntries` هم حذف شود (همان الگوی persist).

هیچ تغییری در بک‌اند، RPC، edge functions، یا منطق Library/Final Film لازم نیست. منطق snapshotهای پروژه دست‌نخورده می‌ماند؛ فقط نشت snapshot رفع می‌شود.

## فایل‌های تغییر یافته

- `src/modules/generator-ui/pages/DashboardPage.tsx` — افزودن prune برای `draftSourceJobs` و `draftSourceImages` در `deleteCard`.

## اعتبارسنجی

- در حالت داشتن یک draft فعال، کلیک روی سطل آشغال یک کارت → کارت بلافاصله ناپدید می‌شود و بعد از refresh هم برنمی‌گردد.
- بعد از F5، listMyJobs دیگر آن job را برنمی‌گرداند (سرور قبلاً حذف کرده)، و چون draft snapshot هم تمیز شده، resurrection ندارد.
- حذف در حالت بدون پروژهٔ انتخاب‌شده، و حذف draft کامل، رفتار قبلی را حفظ می‌کنند.
