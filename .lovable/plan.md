## حذف دکمه‌ی Preview از دیالوگ Soundtrack

دکمه‌ی **Preview** در فوتر دیالوگ "Soundtrack for Final Film" حذف می‌شود (همان دکمه‌ای که در اسکرین‌شات با قرمز دور آن کشیده شده).

## فایل تغییر یافته

- `src/modules/generator-ui/pages/DashboardPage.tsx` — خطوط 1785–1797: حذف بلوک `<div className="flex gap-2">` که شامل دکمه‌ی Preview است و نگه داشتن فقط دکمه‌ی **Done**.

## بررسی پذیرش

- در دیالوگ Soundtrack فقط دکمه‌های **Remove** (چپ) و **Done** (راست) دیده می‌شوند.
- منطق پخش پیش‌نمایش (`handlePreviewMusicRange`) دست‌نخورده باقی می‌ماند (در صورت نیاز در آینده استفاده شود)، اما دیگر از UI قابل دسترس نیست.
