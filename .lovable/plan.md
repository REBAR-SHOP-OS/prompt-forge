## نتیجه نهایی مورد انتظار

- بعد از refresh، پنل HISTORY دیگر کل تاریخچه‌ی ساخته‌شده‌ها را sync و نمایش نمی‌دهد.
- در workspace پیش‌فرض فقط کارت‌های پروژه‌ی فعال فعلی دیده می‌شوند؛ کارت‌های پروژه‌های Library یا کارت‌های قدیمی loose هرگز وارد workspace نمی‌شوند.
- فقط وقتی کاربر یک Final Film را از Library باز کند، همان source cardهای همان پروژه نمایش داده می‌شوند.
- هر ویدیو/تصویر loose که Final Film نشده و داخل پروژه‌ی Library نیست، به‌صورت دائمی حذف می‌شود؛ نه فقط hide در localStorage.

## قیود و چیزهایی که نباید بشکند

- Final Filmهای ذخیره‌شده در Library و sourceهای همان پروژه نباید حذف شوند.
- دکمه‌های حذف تکی، دانلود Final Film، ساخت Final Film، upload و Generate image with AI باید رفتار فعلی خود را حفظ کنند.
- دیگر نباید به `listMyJobs()` به‌عنوان منبع نمایش workspace HISTORY اعتماد شود، چون همین باعث برگشت همه‌ی کارت‌های قدیمی بعد از refresh می‌شود.
- حذف دائمی باید fail-safe باشد: اگر موردی متعلق به Library/project snapshot باشد، حذف نشود.

## حالت اجرا

SAFE MODE:
1. اول منطق candidateها را در کد محدود می‌کنم تا قبل از delete فقط موارد loose شناسایی شوند.
2. سپس حذف واقعی فقط روی همان candidateهای محافظت‌نشده انجام می‌شود.
3. بعد از تغییرات، مسیرهای refresh، Start Over و Final Film را با سیگنال‌های قابل مشاهده/کد اعتبارسنجی می‌کنم.

## پلن پیاده‌سازی

### 1. حذف منبع نشت از refresh

در `DashboardPage.tsx` منطق bootstrap فعلی که بعد از refresh این کار را می‌کند:

```text
listMyJobs() -> hydrateJobs() -> setGeneratedVideos(all jobs)
```

را تغییر می‌دهم تا default workspace دیگر کل job history کاربر را وارد state نکند.

به‌جایش یک workspace manifest per-user نگه داشته می‌شود:

```text
workspace-active-jobs:{userId}
workspace-active-images:{userId}
```

فقط idهایی که واقعاً مربوط به پروژه‌ی فعال فعلی هستند hydrate می‌شوند.

### 2. ثبت فقط کارت‌های پروژه‌ی فعال

هرجا کارت تازه ساخته می‌شود، همان id وارد manifest پروژه‌ی فعال می‌شود:

- ساخت ویدیو با AI
- upload ویدیو
- upload تصویر
- Generate image with AI

بعد از Final Film:

- sourceهای همان پروژه داخل `projectSourceJobs/projectSourceImages` ذخیره می‌شوند.
- idها از manifest فعال پاک می‌شوند.
- workspace خالی می‌شود.
- sourceها فقط با باز کردن همان Library project دوباره نمایش داده می‌شوند.

### 3. حذف دائمی looseها در Start Over

`handleStartOver` را قطعی‌تر می‌کنم:

- candidateهای loose = مواردی که نه در manifest پروژه‌ی فعال باید بمانند، نه در source snapshot هیچ Library project هستند.
- برای ویدیوها: `jobOrchestratorGateway.deleteJob(id)`
- برای تصاویر: `generatorUiGateway.deleteUserImage(id)`
- حذف با `Promise.allSettled` انجام می‌شود تا یک خطا کل cleanup را متوقف نکند.
- بعد از حذف، state و manifest هم پاک می‌شوند تا refresh دوباره چیزی برنگرداند.

### 4. cleanup بعد از refresh برای legacy leakage

برای کارت‌هایی که قبلاً اشتباه ذخیره شده‌اند:

- بعد از hydrate شدن `projectSourceJobs/projectSourceImages` و workspace manifest، یک cleanup محافظه‌کارانه اجرا می‌شود.
- هر job/image که از backend برگردد ولی در هیچ Library source snapshot و در manifest فعال نباشد، دیگر نمایش داده نمی‌شود و برای حذف دائمی ارسال می‌شود.
- sourceهای Library به‌عنوان protected id نگه داشته می‌شوند و حذف نمی‌شوند.

### 5. اصلاح UI پیام Syncing

پیام فعلی `Syncing render history` گمراه‌کننده است، چون دیگر نباید history کلی sync شود.

آن را به حالت درست تبدیل می‌کنم:

- اگر workspace فعال چیزی ندارد: `No renders yet`
- اگر فقط پروژه‌ی انتخابی از Library در حال hydrate است: پیام loading محدود به همان پروژه، نه کل history.

### 6. اعتبارسنجی

بعد از اجرا بررسی می‌کنم:

- refresh در workspace پیش‌فرض: هیچ کارت قدیمی از پروژه‌های دیگر نمایش داده نشود.
- Start Over: کارت‌های loose از UI و backend حذف شوند و بعد از refresh برنگردند.
- Final Film: sourceهای همان پروژه در Library حفظ شوند.
- باز کردن یک Library project: فقط کارت‌های همان پروژه نمایش داده شوند.
- حذف تکی و دانلود Final Film همچنان کار کنند.