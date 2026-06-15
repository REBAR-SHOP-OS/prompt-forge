## مشکل
وقتی داخل یک پروژه‌ی موجود (Draft) پرامت + عکس اضافه می‌کنی، به‌جای افزوده‌شدن کلیپ به همان پروژه، یک پروژه‌ی جدید ساخته می‌شود.

## علت ریشه‌ای
در `src/modules/generator-ui/pages/DashboardPage.tsx`:
- تابع `resumeSelectedProject()` (خط ۴۳۳۵–۴۳۴۱) فقط با `setActiveDraftId(pid)` پروژه‌ی فعال را ست می‌کند که یک setter ناهمگام (async) است.
- بلافاصله بعد از آن، `ensureActiveDraftGroupId()` مقدار را از روی `ensureActiveDraftIdRef.current` می‌خواند که هنوز مقدار قدیمی (اغلب `null`) را دارد.
- در نتیجه یک UUID تازه ساخته می‌شود و کلیپ در پروژه‌ی جدید قرار می‌گیرد.

## راه‌حل (فقط همین یک فایل)
`src/modules/generator-ui/pages/DashboardPage.tsx`

1. در `resumeSelectedProject` (خط ۴۳۳۵–۴۳۴۱): علاوه بر `setActiveDraftId`، مقدار `ensureActiveDraftIdRef.current` را هم به‌صورت همگام (synchronous) ست کنیم:
   - حالت draft → `ensureActiveDraftIdRef.current = pid`
   - حالت غیر-draft → `ensureActiveDraftIdRef.current = null`
   
   اینطوری `ensureActiveDraftGroupId()` در همان tick مقدار درست را می‌خواند.

2. مسیر ارسال صحنه‌ها (multi-scene): در `handleSubmit` (خط ۴۳۹۹–۴۴۱۱) شاخه‌ی `=== Scene N ===` پیش از فراخوانی `resumeSelectedProject()` با `return` خارج می‌شود و همان باگ را دارد. ترتیب اصلاح می‌شود تا `resumeSelectedProject()` قبل از شاخه‌بندی صحنه‌ها اجرا شود (یا داخل `submitScenesAsJobs` فراخوانی شود) تا کلیپ‌های چندصحنه‌ای هم در همان پروژه بمانند.

## اعتبارسنجی
- باز کردن یک پروژه‌ی Draft و ارسال پرامت + عکس → کلیپ جدید زیر همان `SHOWING PROJECT` ظاهر شود، نه در پروژه‌ی جدید.
- بررسی build بدون خطا.

## ریسک
کم — فقط یک ref با state موجود همگام می‌شود. پروژه‌های نهایی (read-only) دست‌نخورده می‌مانند.