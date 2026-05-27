# رفع باگ: نشت کلیپ‌های پروژه‌های درفت دیگر در Final Film

## مشکل (Root Cause)

در `src/modules/generator-ui/pages/DashboardPage.tsx`، تابع `handleMergeAllVideos` (خط ۳۶۰۲) برخلاف UI، از لیست فیلتر‌شده‌ی `displayedClips` استفاده نمی‌کند. در عوض:

```ts
// خط 3613-3623
const videoJobsById = new Map<string, JobDetail>()
for (const v of completedSourceVideos) videoJobsById.set(v.id, v)  // ⚠️ همه ویدیوهای حساب
for (const j of snapshotForMerge) { ... }
```

و `completedSourceVideos` (خط ۲۰۱۰) فقط فیلتر `status === completed` دارد — **هیچ فیلتری برای `workspaceHiddenJobIds`، `projectSourceJobs`، یا `draftSourceJobs` ندارد.**

نتیجه:
- وقتی کاربر چند درفت دارد و درفت A را Final می‌کند، کلیپ‌های درفت B و C هم وارد ویدیوی نهایی می‌شوند.
- حتی وقتی `selectedProjectId` ست شده، snapshot پروژه با همه‌ی ویدیوهای حساب union می‌شود.

برای تصاویر نیز `visibleUserImages` (خط ۲۱۷۹) فقط `projectSourceImages` (پروژه‌های نهایی) را حذف می‌کند ولی `draftSourceImages` را حذف نمی‌کند — پس تصاویر درفت‌های دیگر هم نشت می‌کنند.

## تغییرات

**فایل:** `src/modules/generator-ui/pages/DashboardPage.tsx`

### ۱. اصلاح `handleMergeAllVideos` (حدود خط ۳۶۰۲-۳۶۳۸)

ساخت مجموعه merge را به دو مسیر تقسیم می‌کنیم:

- **حالت پروژه انتخاب‌شده (`selectedProjectId` ست است):**
  فقط از snapshot آن پروژه/درفت استفاده شود (`projectSourceJobs[id] ?? draftSourceJobs[id]` برای ویدیو، و `projectSourceImages[id] ?? draftSourceImages[id]` برای تصویر). از `completedSourceVideos` و `userImages` به‌صورت سراسری استفاده نکن — فقط برای hydrate کردن داده‌های زنده از `id`های snapshot.

- **حالت ورک‌اسپیس پیش‌فرض (بدون انتخاب پروژه):**
  از همان منطق `displayedVideos` + `visibleUserImages` استفاده شود، با این تفاوت که:
  - کلیپ‌های claimed توسط **هر** snapshot (شامل `projectSourceJobs` و `draftSourceJobs`) حذف شوند.
  - تصاویر claimed توسط `projectSourceImages` **و** `draftSourceImages` حذف شوند.
  - `workspaceHiddenJobIds` / `workspaceHiddenImageIds` همچنان حذف شوند.

این دقیقاً همان مجموعه‌ای است که در UI به کاربر نمایش داده می‌شود (یعنی `displayedClips`)، پس قانون «what you see is what you finalize» برقرار می‌شود.

### ۲. اصلاح `visibleUserImages` (خط ۲۱۷۹-۲۱۹۲)

به `claimedByProjects` هم `draftSourceImages` اضافه شود تا تصاویر درفت‌های دیگر در ورک‌اسپیس فعلی پنهان شوند (همان رفتاری که `displayedVideos` با `claimedByProjects` ندارد و باید اضافه شود).

### ۳. اصلاح `displayedVideos` (خط ۲۱۲۵-۲۱۳۰)

به `claimedByProjects` هم `draftSourceJobs` اضافه شود تا کلیپ‌های ویدیویی درفت‌های دیگر در ورک‌اسپیس پیش‌فرض نشت نکنند.

### ۴. حذف منطق "re-finalize بعد از hidden"

کامنت‌های خط ۳۶۰۸-۳۶۱۲ توضیح می‌دهند که عمداً از `displayedClips` رد شده‌اند تا کلیپ‌های hidden قابل re-finalize باشند. این use-case به‌جای دور زدن فیلتر، باید با باز کردن مجدد پروژه از Library انجام شود (که `selectedProjectId` ست می‌شود و مسیر اول snapshot را برمی‌گرداند).

## اعتبارسنجی

1. دو درفت با کلیپ‌های متفاوت بساز.
2. روی درفت A کلیک کن، Final Film بزن.
3. **انتظار:** ویدیوی نهایی فقط شامل کلیپ‌های درفت A باشد.
4. سپس درفت B را باز کن — کلیپ‌هایش دست‌نخورده باشند.
5. در حالت ورک‌اسپیس پیش‌فرض (بدون انتخاب پروژه)، کلیپ‌های هیچ درفتی نمایش داده نشوند.
6. بازکردن یک پروژه قدیمی از Library و زدن Final Film دوباره — فقط کلیپ‌های همان پروژه merge شوند.

## نکات

- بدون تغییر دیتابیس یا edge function — فقط منطق فرانت‌اند.
- کش `localStorage` (`project-source-jobs`, `active-draft-id`, ...) دست‌نخورده می‌ماند.
- ratio lock و overlay و audio mixing تحت تأثیر قرار نمی‌گیرند.
