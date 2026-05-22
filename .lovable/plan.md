## مشکل
وقتی پروژه نهایی ساخته می‌شود فقط `activeDraftId` بسته می‌شود، اما اگر کلیپ‌های منبع از طریق درفت‌های دیگر (مثل `draft-orphan-{jobId}` که به‌طور خودکار برای هر کلیپ تنها ساخته می‌شوند، یا یک درفت قبلی که از Library دوباره باز شده) وارد ورک‌اسپیس شده باشند، آن درفت‌ها همچنان در بخش Drafts باقی می‌مانند چون منطق پاکسازی فقط درفت فعال جلسه را هدف می‌گیرد.

## راه‌حل
در `src/modules/generator-ui/pages/DashboardPage.tsx`، بلافاصله بعد از `setProjectSourceImages` و قبل از بلاک `if (activeDraftId)` (حدود خط 3704)، همهٔ درفت‌هایی را که حاوی کلیپ یا تصویرِ منبعِ این Final Film هستند پیدا کرده و حذف کنیم:

1. ساخت `mergedJobIdSet` از `eligibleClips` با `kind === 'video'` و `mergedImageIdSet` از `kind === 'image'`.
2. پیمایش `draftSourceJobs` و `draftSourceImages` و جمع‌آوری هر `draftId` که حداقل یک id مشترک با مجموعه‌های بالا دارد (به‌علاوهٔ `activeDraftId` در صورت وجود) در یک `Set<string> draftIdsToClose`.
3. اگر `draftIdsToClose` غیرخالی بود:
   - `setDraftEntries(prev => filter out)` + `persistDraftEntries`
   - حذف کلیدها از `draftSourceJobs` و `draftSourceImages` با persist مربوطه
   - افزودن همان idها به `deletedDraftIds` و persist، تا افکت backfill بعدی (که هر کلیپ کلیم‌نشده را دوباره به‌صورت `draft-orphan-*` می‌سازد) آن‌ها را دوباره برنگرداند. برای درفت‌های `draft-orphan-{id}` و `draft-orphan-img-{id}`، اضافه‌کردنِ خود `draftId` کافی است چون شرط `deletedDraftIds.has(draftId)` در backfill بررسی می‌شود.
4. `setActiveDraftId(null)` و `persistActiveDraftId(null)` اگر `activeDraftId` در مجموعه بود (بلاک موجود را حفظ/جذب می‌کنیم).

## چرا امن است
- `mergedEntries` و `projectSourceJobs[mergedId]` دست‌نخورده می‌مانند، پس Final Film و تاریخچهٔ آن در Library سالم است.
- استفاده از `deletedDraftIds` فقط مانع از بازسازی خودکار درفت‌های orphan برای همان clip ids می‌شود؛ روی پروژه‌های Final تأثیری ندارد چون آن‌ها از مسیر `mergedEntries` رندر می‌شوند نه backfill.
- بدون تغییر بکند/اسکیما.

## فایل تغییر یافته
- `src/modules/generator-ui/pages/DashboardPage.tsx` (فقط)
