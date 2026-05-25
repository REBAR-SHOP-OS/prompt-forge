## هدف
وقتی کاربر نسبت ابعاد را انتخاب می‌کند و اولین درخواست ساخت را ثبت می‌کند، آن نسبت باید بلافاصله برای کل پروژه قفل شود — حتی پیش از اینکه ویدئوی اول آماده شود — تا تمام کلیپ‌های بعدی همان نسبت را داشته باشند. قفل تنها با **Start Over** آزاد می‌شود.

## وضعیت فعلی
- `lockedRatio` (UI lock) فقط زمانی فعال می‌شود که یک کلیپ یا تصویر «زنده» در workspace وجود داشته باشد.
- `lockedProjectRatio` (state ماندگار برای merge) فقط **پس از اتمام موفق** اولین کلیپ ست می‌شود (خط ~2848).
- نتیجه: بین لحظه‌ی Submit و آماده‌شدن اولین کلیپ، کاربر می‌تواند ratio را تغییر دهد و کلیپ دوم با نسبت متفاوت ساخته شود.

## تغییرات (فقط `src/modules/generator-ui/pages/DashboardPage.tsx`)

1. **ست‌کردن `lockedProjectRatio` در زمان Submit، نه پس از تکمیل:**
   - در مسیر submit ویدئو (همان جایی که `effectiveRatio` محاسبه و job ارسال می‌شود، حوالی خطوط 2793 و 2971)، بلافاصله قبل از enqueue:
     ```ts
     if (!lockedProjectRatio) {
       setLockedProjectRatio(effectiveRatio)
     }
     ```
   - بلوک‌های فعلی `if (!lockedProjectRatio)` که در completion هستند (خطوط 2848 و 2999) حذف یا به‌عنوان safety-net حفظ شوند.

2. **افزودن `lockedProjectRatio` به منطق `lockedRatio` UI (خطوط 1805-1844):**
   - در ابتدای memo، اگر `lockedProjectRatio` موجود است و پروژه‌ی Library انتخاب نشده، همان را برگردان:
     ```ts
     if (!selectedProjectId && lockedProjectRatio) return lockedProjectRatio
     ```
   - این باعث می‌شود دکمه‌های ratio بلافاصله پس از Submit قفل شوند، حتی اگر کلیپ هنوز در `generatedVideos` ظاهر نشده باشد.
   - `lockedProjectRatio` به deps memo اضافه شود.

3. **Start Over** — تأیید اینکه `setLockedProjectRatio(null)` (و پاک‌سازی localStorage) همچنان فراخوانی می‌شود تا قفل آزاد گردد. (در حال حاضر انجام می‌شود؛ تنها بررسی.)

## ریسک‌ها
- بسیار محدود؛ تنها زمان‌بندی ست‌شدن یک state موجود تغییر می‌کند.
- اگر job اولین کاربر fail شود، قفل همچنان فعال می‌ماند تا Start Over. این رفتار مطلوب است چون کاربر نسبت را آگاهانه انتخاب کرده.

## فایل‌ها
- `src/modules/generator-ui/pages/DashboardPage.tsx` (تنها فایل تغییریافته)
