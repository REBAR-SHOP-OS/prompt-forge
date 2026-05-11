## هدف

افزودن یک آیکون تقویم در گوشه بالا سمت چپ `DashboardPage` (کنار آیکون گرید). با کلیک، یک Popover/Dialog باز می‌شود که شامل تقویم میلادی است؛ با انتخاب هر تاریخ، اطلاعات کامل آن روز (مناسبت‌ها، رویدادهای تاریخی، شخصیت‌های متولد/درگذشته، حقایق جالب) توسط Lovable AI تولید و نمایش داده می‌شود.

## تغییرات Frontend

### 1. کامپوننت جدید: `src/modules/generator-ui/components/CalendarInfoDialog.tsx`
- یک `Dialog` با دو ستون:
  - چپ: `Calendar` (shadcn) به صورت `mode="single"` با `pointer-events-auto`
  - راست: ناحیه نمایش اطلاعات روز انتخاب‌شده
- State:
  - `selectedDate: Date` (پیش‌فرض: امروز)
  - `info: string | null`
  - `loading: boolean`
  - `error: string | null`
  - `cache: Record<string, string>` (کلید: `MM-DD` تا برای سال‌های مختلف ثابت بماند، یا `YYYY-MM-DD` اگر شامل رویدادهای تاریخی سال‌محور باشد — انتخاب: `YYYY-MM-DD` چون شامل اطلاعات تاریخی است)
- وقتی `selectedDate` تغییر کرد: اگر در cache بود نمایش بده، وگرنه `supabase.functions.invoke('day-info', { body: { date: 'YYYY-MM-DD' } })` صدا بزن.
- نمایش با `react-markdown` (در پروژه موجود است؛ اگر نه، از `<div className="prose prose-invert whitespace-pre-wrap">` ساده استفاده کن).
- مدیریت خطاهای 429/402 با toast.

### 2. تغییر در `src/modules/generator-ui/pages/DashboardPage.tsx`
- import آیکون `CalendarDays` از `lucide-react` و کامپوننت جدید.
- در ناحیه بالا سمت چپ (همان ردیفی که آیکون گرید + لوگوی پرتقالی هست) یک دکمه‌ی آیکونی اضافه کن، دقیقاً با همان استایل دکمه گرید موجود (همان اندازه/padding/hover).
- state محلی `isCalendarOpen` و رندر `<CalendarInfoDialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen} />`.

## تغییرات Backend

### Edge Function جدید: `supabase/functions/day-info/index.ts`
- ورودی: `{ date: 'YYYY-MM-DD' }` با اعتبارسنجی Zod (یا regex ساده).
- بدون نیاز به auth (فقط info عمومی)؛ `verify_jwt = false` پیش‌فرض.
- CORS استاندارد.
- فراخوانی Lovable AI Gateway با مدل `google/gemini-3-flash-preview`:
  - System prompt: "You are a knowledgeable historian and cultural guide. For any given Gregorian date, return rich, well-structured Markdown including: notable historical events on this day, famous birthdays, deaths, international observances/holidays, and 1-2 fun facts. Be accurate and concise."
  - User prompt: "Provide complete information about this date: {date} (month/day). Use Markdown with headings."
- مدیریت 429/402 و بازگرداندن خطاهای واضح.
- پاسخ: `{ markdown: string }`.

## خارج از scope
- بدون ذخیره‌سازی در دیتابیس (cache فقط در حافظه‌ی session).
- بدون تغییر در music/voiceover/Final Film.
- بدون تقویم شمسی/قمری (طبق انتخاب کاربر).

## تأیید
- روی آیکون تقویم کنار گرید کلیک شود → Dialog باز شود، تاریخ امروز به‌صورت پیش‌فرض انتخاب باشد و اطلاعات load شود.
- انتخاب تاریخ دیگر → loading نمایش داده شود سپس Markdown اطلاعات.
- انتخاب همان تاریخ دوباره → از cache فوراً نمایش داده شود.
- Final Film و سایر بخش‌ها بدون تغییر کار کنند.
