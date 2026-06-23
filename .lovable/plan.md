# تم‌های آماده برای اطلاعات تماس روی فیلم

افزودن مجموعه‌ای از تم‌های آماده به پنل «Contact overlay». کاربر با یک کلیک یک تم را انتخاب می‌کند و استایل کامل اطلاعات تماس (رنگ متن، فونت، رنگ/شفافیت لایه‌ی پس‌زمینه) روی پیش‌نمایش و ویدیوی نهایی اعمال می‌شود.

## تم‌های پیشنهادی
هر تم یک نام و یک نمونه‌ی رنگ کوچک دارد و این مقادیر را ست می‌کند: رنگ متن، فونت، فعال/غیرفعال بودن لایه، رنگ لایه، شفافیت لایه.

- **Classic** — متن سفید، لایه‌ی مشکی ۴۵٪، فونت سیستمی (پیش‌فرض فعلی).
- **Minimal** — متن سفید، بدون لایه‌ی پس‌زمینه، فونت تمیز (Outfit).
- **Cinematic** — متن کرم/طلایی روشن، لایه‌ی مشکی ۶۰٪، فونت سریف (Playfair Display).
- **Neon** — متن فیروزه‌ای روشن، لایه‌ی مشکی ۵۵٪، فونت مدرن (Space Grotesk).
- **Sunlight** — متن مشکی، لایه‌ی سفید ۷۰٪، فونت Outfit.
- **Gold Luxe** — متن طلایی، لایه‌ی مشکی ۵۰٪، فونت Playfair Display.

(نام/رنگ‌ها قابل تنظیم؛ شروع با همین ۶ تم.)

## تغییرات

### ۱) فونت‌ها
- نصب پکیج‌های فونت با `bun add @fontsource/outfit @fontsource/space-grotesk @fontsource/playfair-display` و import آن‌ها در `src/main.tsx` تا هم در UI و هم در رندر canvas (burn-in) در دسترس باشند.

### ۲) نوع داده و state — `DashboardPage.tsx`
- افزودن دو فیلد جدید به `ContactOverlay`:
  - `textColor: string` (هگز، پیش‌فرض `#ffffff`)
  - `fontFamily: string` (رشته‌ی font-family، پیش‌فرض فونت سیستمی فعلی)
- یک ثابت `CONTACT_THEMES` (آرایه‌ای از `{ id, label, textColor, fontFamily, panelEnabled, panelColor, panelOpacity, swatch }`).
- مقادیر پیش‌فرض در `emptyContact()` و fallback هنگام بارگذاری از localStorage برای پروژه‌های موجود.

### ۳) UI پنل — `DashboardPage.tsx`
- افزودن بخش «Theme» در بالای بخش‌های Background/Logo: یک گرید از دکمه‌های تم (نام + نمونه‌رنگ). کلیک روی هر تم با یک `updateContact(...)` همه‌ی فیلدهای استایل را یکجا ست می‌کند.
- بخش‌های دستی موجود (رنگ لایه، شفافیت، روشن/خاموش) باقی می‌مانند تا بعد از انتخاب تم هم بشود دستی تنظیم کرد.

### ۴) اعمال رنگ متن و فونت در پیش‌نمایش — `DashboardPage.tsx`
- در رندر اورلی، رنگ ثابت `text-white` و فونت پیش‌فرض با `color` و `fontFamily` داینامیک از `contactOverlay` جایگزین می‌شوند.

### ۵) Burn-in در ویدیوی نهایی — `mergeVideos.ts`
- افزودن `textColor?` و `fontFamily?` به `MergeOverlayOptions`.
- در `drawOverlay`، رشته‌ی `ctx.font` با فونت انتخاب‌شده ساخته می‌شود و `ctx.fillStyle = '#ffffff'` (سه محل) به `textColor` تغییر می‌کند.
- عبور دادن دو فیلد جدید در هر دو payload (خط ساخت اورلی در `DashboardPage.tsx` و بازسازی `activeOverlay` در `mergeVideos.ts`).

## بدون تغییر
- بدون تغییر دیتابیس. کاملاً افزایشی روی همان جریان اورلی فعلی؛ تم Classic رفتار فعلی را عیناً حفظ می‌کند.