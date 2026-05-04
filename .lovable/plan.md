# پخش ویدئو در کارت Library

در پنل Library سمت چپ، thumbnail هر ویدئو ذخیره‌شده فقط یک تگ `<video>` بدون `controls` است (روی فایل‌های `.webm` تولیدشده با MediaRecorder، فریم اول هم نمایش داده نمی‌شود → کادر سیاه خالی). با کلیک روی کارت، ID انتخاب می‌شود و در player وسط صفحه پخش می‌شود، اما کاربر انتظار دارد همان‌جا داخل کارت هم بتواند پلی کند.

## تغییر

در `src/modules/generator-ui/pages/DashboardPage.tsx` (تقریباً خط ۱۴۶۰–۱۴۷۴، داخل map روی `approvedVideos`):

- افزودن attribute `controls` به تگ `<video>` thumbnail.
- تغییر `object-cover` به `object-contain` تا کل فریم دیده شود.
- حذف `muted` (تا با controls صدا هم پخش شود).
- اضافه‌کردن `onClick={e => e.stopPropagation()}` روی wrapper تا کلیک روی کنترل‌های ویدئو باعث trigger شدن انتخاب کارت/بستن پنل نشود.

با این تغییر کاربر می‌تواند مستقیماً داخل کارت Library روی Play بزند و ویدئو را ببیند، و هم‌زمان کلیک روی بقیه‌ی نواحی کارت همان رفتار قبلی (نمایش در player اصلی) را حفظ می‌کند.

## فایل تغییر

- `src/modules/generator-ui/pages/DashboardPage.tsx` — فقط بلوک thumbnail داخل کارت Library.

تغییر دیگری لازم نیست.
