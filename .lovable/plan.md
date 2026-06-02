## هدف
بازگرداندن تقویم کامل (Calendar) که با آیکون باز می‌شود، و حذف فقط بخش «Today's Occasions» (پاپ‌آپ خودکار بعد از ورود).

## وضعیت فعلی
در درخواست قبلی به‌اشتباه کل تقویم حذف شد: دکمهٔ آیکون تقویم، importها، رندر `CalendarInfoDialog` و افکت auto-open همگی حذف شدند.

## تفکیک دو بخش
- **Calendar (باید برگردد):** دیالوگ کامل با ستون تقویم، جزئیات روز و لیست ماه، که با کلیک روی آیکون تقویم باز می‌شود (`todayOnly={false}`).
- **Today's Occasions (باید حذف بماند):** همان دیالوگ در حالت `todayOnly` که بعد از ورود به‌صورت خودکار از طریق `localStorage` باز می‌شد.

## تغییرات در `src/modules/generator-ui/pages/DashboardPage.tsx`
1. بازگرداندن importها: `CalendarInfoDialog` و آیکون `CalendarDays`.
2. بازگرداندن state `isCalendarOpen` (بدون `calendarTodayOnly` و بدون افکت auto-open).
3. بازگرداندن دکمهٔ شناور آیکون تقویم که `setIsCalendarOpen(true)` را صدا می‌زند.
4. بازگرداندن رندر `<CalendarInfoDialog />` با `todayOnly={false}` (ثابت)، شامل `onApplyPrompt`.

## ملاحظات
- افکت auto-open بعد از ورود (و کلید `pending-occasions-popup`) بازگردانده نمی‌شود تا پاپ‌آپ «Today's Occasions» دیگر هرگز خودکار باز نشود.
- فایل `CalendarInfoDialog.tsx` همچنان حالت `todayOnly` را در کد دارد ولی دیگر از داشبورد فراخوانی نمی‌شود؛ تغییر حداقلی و غیرمخرب است.
- فقط تغییرات UI/presentation؛ بدون تغییر بک‌اند.
