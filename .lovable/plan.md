## هدف
پنل Library به دو بخش مجزا تقسیم شود:
1. **Final videos** — ویدئوهای نهایی شده (Final Film ها)
2. **Drafts** — پروژه‌هایی که کلیپ‌هایشان ساخته و ذخیره شده‌اند اما هنوز به Final Film تبدیل نشده‌اند

## محدوده تغییرات
فقط `src/modules/generator-ui/pages/DashboardPage.tsx` (فقط UI — بدون تغییر backend یا منطق ذخیره‌سازی).

## پیاده‌سازی

### ۱) تفکیک داده در `libraryItems` (حوالی خط ۱۲۸۷)
به‌جای یک آرایه‌ی واحد، دو لیست محاسبه می‌شود:
- `finalizedItems`: آیتم‌هایی که در `mergedEntries` هستند (یا live نسخه‌شان merged است) و در `approvedIds` تأیید شده‌اند.
- `draftItems`: آیتم‌هایی از `librarySavedJobs` (یا live معادلشان) که در `approvedIds` هستند **و** در `mergedEntries` نیستند.

هر دو لیست به ترتیب نزولی تاریخ مرتب می‌شوند. شمارنده‌ی Library badge همچنان مجموع هر دو است.

### ۲) UI پنل Library (حوالی خط ۴۷۳۵–۴۸۷۸)
ساختار فعلی «Saved videos / Your library» جایگزین می‌شود با دو سکشن قابل تشخیص:

```text
LIBRARY  [count]                       [X]
─────────────────────────────────────────
Final videos  [n]
  ▢ card  ▢ card  ▢ card …
─────────────────────────────────────────
Drafts  [m]
  ▢ card  ▢ card  ▢ card …
```

- هر سکشن header کوچک با عنوان + شمارنده دارد.
- اگر یک سکشن خالی بود، یک پیام کوتاه placeholder نمایش می‌دهد (مثل «No final videos yet» / «No drafts yet»).
- اگر هر دو خالی بودند، همان empty-state فعلی نمایش داده می‌شود.
- markup خود کارت‌ها (thumbnail + prompt + download + delete + تاریخ) بدون تغییر بازاستفاده می‌شود — فقط در یک helper کوچک یا map دوبار رندر می‌شوند.
- بج «Saved» داخل کارت در سکشن Drafts با بج «Draft» (رنگ amber/zinc) جایگزین می‌شود تا تفکیک بصری روشن باشد. در سکشن Final videos همان «Saved» سبز باقی می‌ماند.

### ۳) رفتار کلیک
بدون تغییر: کلیک روی هر کارت همان `setPreviewVideoId` + `setSelectedProjectId` فعلی را اجرا می‌کند. منطق «کارت‌های هر پروژه فقط برای همان پروژه» که قبلاً پیاده شد دست‌نخورده باقی می‌ماند.

## خارج از محدوده
- تغییر در منطق ذخیره (`librarySavedJobs` / `mergedEntries`) یا تعریف اینکه چه چیزی draft محسوب می‌شود به‌جز همین تفکیک حضور در `mergedEntries`.
- بدون تغییر backend / RLS / migration.
- بدون تغییر در snapshot fix قبلی برای source clip ها.
