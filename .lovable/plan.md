## مشکل
کارت‌های Draft (در Library) و Pending به اشتباه «Video unavailable» نشان می‌دهند، در حالی که همان ویدئو در preview مرکزی به‌درستی پخش می‌شود. پس URL سالم است.

## ریشه
کامپوننت `PlayableVideo` یک `<video preload="metadata">` مخفی mount می‌کند و فقط بعد از `loadedmetadata` ویدئو واقعی را نشان می‌دهد. اگر این رویداد در ۱۵ ثانیه نرسد (پروکسی Aliyun OSS کند است یا چند کارت همزمان درخواست می‌دهند)، watchdog state را به `error` می‌برد و «Video unavailable» نمایش داده می‌شود — حتی وقتی فایل کاملاً سالم است. این gate دو-مرحله‌ای علت اصلی است، نه خود URL.

## برنامه (فقط فرانت‌اند، یک فایل)

ساده‌سازی `src/modules/generator-ui/components/PlayableVideo.tsx`:

1. حذف مرحله‌ی hidden-video و watchdog ۱۵ ثانیه‌ای.
2. به محض اینکه URL با proxy ریزالو شد، مستقیماً همان `<video>` نهایی (با `poster`، `controls`، `muted`، `playsInline`) را render کن.
3. تا زمانی که URL ریزالو نشده، loader نمایش بده.
4. حالت `error` فقط در پاسخ به رویداد واقعی `onError` خود `<video>` فعال شود، نه با timeout.
5. منطق فعلی `onLoadedMetadata` (پذیرش WebM با duration نامعتبر) حفظ شود، ولی فقط برای فراخوانی callback خارجی — دیگر state را به ready/error تغییر نمی‌دهد.

نتیجه: کارت‌های Draft و Pending مثل preview مرکزی فایل را پخش می‌کنند و فقط در شکست واقعی شبکه پیام «Video unavailable» می‌دهند. هیچ تغییری در مسیر Final Film، دانلود، یا backend نیست.

## فایل‌های تغییریافته
- `src/modules/generator-ui/components/PlayableVideo.tsx`
