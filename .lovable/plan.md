## مشکل

گاهی صفحه اپ خالی/سیاه باقی می‌ماند و لود نمی‌شود. بعد از بررسی کد و کنسول مرورگر، صفحه واقعاً crash نمی‌کند (هیچ خطای error در console نیست — فقط warning های postMessage مربوط به ادیتور لاوبل که بی‌خطرند). یعنی این مشکل به لاوبل ربطی ندارد و در منطق خود اپ است.

سه نقطه‌ی محتمل برای «گیر کردن» پیدا شد:

### ۱. `LoadingScreen` بی‌نهایت در `AuthProvider`
در `src/core/auth/AuthProvider.tsx`، مقدار `loading` فقط وقتی `false` می‌شود که `supabase.auth.getSession()` یا `refreshProfile()` (که `/me` را صدا می‌زند) برگردد. اگر شبکه کند باشد، edge function `me` کند پاسخ دهد، یا اصلاً پاسخ ندهد، صفحه برای همیشه روی LoadingScreen گیر می‌کند. هیچ timeout یا fallback ای وجود ندارد.

### ۲. `LoginIntro` گیر کننده
در `src/components/intro/LoginIntro.tsx`، اگر ویدیوی اینترو (`@/assets/intro/login-intro.mp4`) بارگذاری نشود، autoplay توسط مرورگر بلاک شود، یا فایل خراب باشد، event `onEnded` هرگز اجرا نمی‌شود → صفحه‌ی سیاه کامل می‌بیند کاربر. دکمه Skip هست اما کاربر فکر می‌کند صفحه لود نشده.

علاوه بر این، چون فلگ `intro_played` در `sessionStorage` ذخیره می‌شود (نه `localStorage`)، در هر تب جدید یا بعد از بستن مرورگر، اینترو دوباره پخش می‌شود — این هم می‌تواند حس «هر بار باید صبر کنم» را به کاربر بدهد.

### ۳. درخواست همزمان دوبل به `/me`
هم `onAuthStateChange` و هم `getSession().then` هنگام لود اولیه `refreshProfile()` را صدا می‌زنند → دو بار /me فراخوانی می‌شود. باعث crash نیست، ولی غیرضروری است.

---

## تغییرات پیشنهادی

### الف) `src/core/auth/AuthProvider.tsx` — اضافه کردن timeout به loading
- یک `setTimeout` ۸ ثانیه‌ای کنار `getSession()` بگذاریم: اگر تا ۸ ثانیه پاسخ نیامد، `setLoading(false)` کنیم تا حداقل LoginPage یا UI نمایان شود به جای صفحه‌ی سیاه.
- جلوگیری از فراخوانی همزمان `refreshProfile` با یک flag ساده.

### ب) `src/components/intro/LoginIntro.tsx` — مقاوم‌سازی
- اضافه کردن `onError` روی تگ `<video>` که اگر ویدیو لود نشد، `onFinish()` صدا زده شود.
- اضافه کردن `onCanPlay` با fallback: اگر تا ۲ ثانیه ویدیو شروع به پخش نکرد (autoplay block)، `onFinish()` صدا زده شود.
- اختیاری: تغییر `sessionStorage` به `localStorage` تا اینترو فقط یک بار در عمر مرورگر پخش شود (اگر کاربر تأیید کند).

### ج) (اختیاری) نمایش پیام در LoadingScreen بعد از ۵ ثانیه
- اگر لودینگ بیش از ۵ ثانیه طول کشید، یک متن مثل «در حال اتصال به سرور…» با دکمه Retry نشان داده شود.

---

## آنچه دست نخورده می‌ماند

- منطق احراز هویت، RLS، edge function ها
- جریان login/logout
- استایل‌ها و ظاهر کلی

---

## سؤال قبل از اجرا

آیا تمایل دارید فلگ `intro_played` را به `localStorage` تغییر دهیم تا اینترو فقط یک بار در عمر مرورگر پخش شود؟ یا همان `sessionStorage` بماند و فقط مقاوم‌سازی شود؟
