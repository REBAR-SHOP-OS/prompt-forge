## Goal
چیپ فایل پیوست‌شده در composer فقط یک تامبنیل مربعی بزرگ‌تر باشد، بدون نام فایل و بدون لیبل target. دکمه × کنارش بماند.

## Change (frontend only — `src/modules/generator-ui/pages/DashboardPage.tsx`، رندر چیپ‌ها در ~خط ۳۸۰۵–۳۸۴۵)

- حذف `<span>{file.name}</span>` و `<span>{file.target}</span>` و متن error داخلی.
- بزرگ کردن تامبنیل از `h-6 w-6` به `h-12 w-12` (تقریباً ۴۸×۴۸).
- `padding` چیپ بیرونی کاهش یابد (مثلاً `p-1` به‌جای `px-3 py-1.5`) تا فقط دور تامبنیل یک قاب نازک بماند.
- دکمه `<button>` preview همان حالت `cursor-zoom-in` را حفظ کند.
- در حالت `uploading` → اسپینر داخل یک placeholder مربعی هم‌اندازه (`h-12 w-12 grid place-items-center`).
- در حالت `failed` → آیکن `AlertTriangle` کوچک یا `Paperclip` در همان box مربعی، با حاشیه‌ی `border-rose-400/40`؛ متن خطا حذف می‌شود ولی `title={file.error}` روی چیپ ست شود تا با hover دیده شود.
- دکمه `×` به یک overlay گوشه‌ی بالا-راست تامبنیل تبدیل شود (`absolute -top-1 -right-1`) با پس‌زمینه‌ی تیره گرد، تا چیپ جمع‌وجور بماند.
- چیپ بیرونی به `relative inline-block` تغییر کند.
- `aria-label` دکمه‌ی preview = `Preview ${file.name}` و دکمه‌ی حذف = `Remove ${file.name}` تا accessibility حفظ شود.

## Out of scope
- بدون تغییر در منطق آپلود/حذف، Dialog پیش‌نمایش بزرگ، یا state.

## Verification
- آپلود عکس → فقط مربع ۴۸×۴۸ از تامبنیل عکس + × کوچک گوشه.
- بدون نام فایل، بدون «Start»/«End» متنی.
- کلیک روی تامبنیل → preview بزرگ.
- × روی گوشه → حذف.
