## مشکل
وقتی روی یک پروژه Draft از Library کلیک می‌شود و Final Film ساخته می‌شود، کارت Draft همچنان در بخش Drafts باقی می‌ماند. علت: کد فعلی (DashboardPage.tsx خط ۳۷۰۶) فقط `activeDraftId` را پاک می‌کند، نه پروژه Draft انتخاب‌شده‌ای که از قبل ذخیره شده.

## تغییر
در `src/modules/generator-ui/pages/DashboardPage.tsx` داخل بلوک موفقیت merge (حدود خط ۳۷۰۴ تا ۳۷۲۷)، علاوه بر بستن `activeDraftId`، draft‌ای که با `selectedProjectId` مطابقت دارد را هم ببندیم.

### مراحل
1. مجموعه‌ای از شناسه‌های draft برای پاک‌سازی بسازیم:
   - `activeDraftId` (اگر موجود)
   - `selectedProjectId` فقط در صورتی که با `'draft-'` شروع شود (یعنی کاربر روی یک draft کلیک کرده و آن را finalize کرده)
2. برای هر شناسه در این مجموعه:
   - از `draftEntries` حذف + persist
   - از `draftSourceJobs` حذف + persist
   - از `draftSourceImages` حذف + persist
   - شناسه را به `deletedDraftIds` (tombstone) اضافه کنیم تا منطق backfill (خطوط ۱۵۶۱–۱۶۴۲) draft را دوباره نسازد
3. در پایان `setActiveDraftId(null)` و `persistActiveDraftId(null)` و اگر `selectedProjectId` همان draft بسته‌شده بود، آن را به `mergedId` تغییر دهیم تا کاربر مستقیماً Final Film جدید را ببیند.

## نکات ایمنی
- منابع (clipها و تصاویر) قبلاً تحت `projectSourceJobs[mergedId]` ادعا شده‌اند، پس حذف entryهای draft هیچ داده‌ای را از بین نمی‌برد.
- فقط فایل `DashboardPage.tsx` تغییر می‌کند؛ بک‌اند و schema دست‌نخورده.
