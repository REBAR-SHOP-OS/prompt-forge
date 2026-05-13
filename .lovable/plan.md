## Goal
چیپ فایل پیوست‌شده در composer به‌جای فقط آیکون Paperclip + نام، یک تامبنیل کوچک از خود عکس را نشان دهد. بقیه‌ی رفتار (کلیک = preview بزرگ، × = حذف، حالات uploading/failed) بدون تغییر.

## Change (frontend only — `src/modules/generator-ui/pages/DashboardPage.tsx`، بخش رندر چیپ‌ها در حدود خط ۳۸۰۵–۳۸۳۵)

داخل `<button>`ی که برای preview استفاده می‌شود، به‌جای `<Paperclip ... />`:

- اگر `file.status === 'ready' && file.url` → یک `<img src={file.url}>` کوچک با کلاس `h-6 w-6 rounded-md object-cover border border-white/10 bg-black` نمایش بده.
- اگر `file.status === 'uploading'` → یک `<LoaderCircle className="h-3.5 w-3.5 animate-spin text-zinc-400" />` نشان بده.
- در غیر این صورت (failed یا بدون url) → `<Paperclip className="h-3.5 w-3.5 text-zinc-500" />` فعلی حفظ شود.

نام فایل و بقیه‌ی متن (target، error) دست‌نخورده می‌ماند. cursor همان `cursor-zoom-in` فعلی برای ready حفظ می‌شود.

## Out of scope
- بدون تغییر در منطق آپلود، حذف، Dialog پیش‌نمایش بزرگ، یا state.
- بدون تغییر روی پنل HISTORY.

## Verification
- آپلود عکس → چیپ تامبنیل ۲۴×۲۴ نشان می‌دهد.
- در حین آپلود → اسپینر کوچک.
- کلیک روی تامبنیل → پیش‌نمایش بزرگ باز می‌شود.
- × همان رفتار حذف.
