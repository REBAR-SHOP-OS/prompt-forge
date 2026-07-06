## هدف
باکس پرامت در چت‌باکس به‌جای نمایش تک‌خطی با اسکرول افقی کوچک و بریده، متن را در کل عرض باکس پخش کند و در صورت طولانی بودن به خط بعد برود (چندخطی و تمام‌عرض).

## تغییر
در `src/modules/generator-ui/pages/DashboardPage.tsx` (المان `<textarea id="prompt-input">`، حدود خط ۱۲۱۵۴–۱۲۱۶۱):

- `rows={1}` → `rows={2}` (شروع دو خطی، قابل رشد).
- کلاس‌های فعلی که متن را تک‌خطی و بریده می‌کنند حذف/اصلاح می‌شوند:
  - حذف `whitespace-nowrap`, `overflow-x-auto`, `max-h-10`.
  - `min-h-10` → ارتفاع مناسب چندخطی مثل `min-h-16`.
  - افزودن `whitespace-pre-wrap break-words` تا متن در عرض کامل بپیچد.
  - نگه‌داشتن `w-full` برای تمام‌عرض بودن و `resize-y` (یا `resize-none`) برای رفتار طبیعی.
  - `overflow-y-hidden` → `overflow-y-auto` و افزودن یک `max-h` معقول (مثل `max-h-40`) تا در متن‌های خیلی بلند اسکرول عمودی داشته باشیم نه بی‌نهایت رشد.

نتیجه: کلاس نهایی چیزی شبیه:
`min-h-16 max-h-40 w-full resize-y overflow-y-auto whitespace-pre-wrap break-words border-0 bg-transparent py-2 text-[15px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-500/70`

## اعتبارسنجی
- اجرای تایپ‌چک/بیلد برای اطمینان از نبود خطا.
- بررسی بصری در پیش‌نمایش که متن پرامت در کل عرض پخش شده و بدون بریدگی/اسکرول افقی به خط بعد می‌رود.

این تغییر فقط ظاهری/frontend است و منطق تولید ویدئو را تغییر نمی‌دهد.