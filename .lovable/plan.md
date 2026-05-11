## هدف
افزودن **ستون سوم** به دیالوگ تقویم که همهٔ مناسبت‌های ماه جاری را به‌صورت تیتر سبز فهرست کند، به‌علاوهٔ نوار **آیکون‌های فیلتر** برای ۳ دستهٔ اصلی (کانادا / بین‌المللی / دینی).

## تغییرات

### 1) Edge Function: `supabase/functions/day-info/index.ts`
- پشتیبانی از حالت ماهانه: اگر body به‌جای `date` شامل `month` (`YYYY-MM`) باشد، prompt درخواست کند برای **هر روز ماه** که مناسبت دارد، آیتم برگرداند.
- افزودن فیلد `category` به schema با enum: `"canada" | "international" | "religious"`.
- افزودن فیلد `date` (`YYYY-MM-DD`) به هر آیتم در حالت ماهانه (در حالت روزانه نیازی نیست).
- در حالت ماهانه: ساختار خروجی `{ occasions: [{ date, title, category, whatItIs, history }] }`. برای کاهش هزینه/توکن، در حالت ماهانه می‌توان `whatItIs`/`history` را اختیاری/کوتاه‌تر کرد، ولی برای سادگی همان شِما حفظ می‌شود (کاربر روی روز کلیک می‌کند تا full detail در کش‌شده ماهانه استفاده شود).
- در حالت روزانه نیز فیلد `category` اضافه شود (برای سازگاری UI).
- قواعد whitelist/blacklist موجود حفظ می‌شود.

### 2) `src/modules/generator-ui/components/CalendarInfoDialog.tsx`
- **چیدمان grid**: از `md:grid-cols-[auto,1fr]` به `md:grid-cols-[auto,1fr,1fr]` (سه ستون: تقویم | جزئیات روز | لیست ماه).
- **State جدید**:
  - `monthCache: Record<string, MonthOccasion[]>` با کلید `v1:${YYYY-MM}:${lang}`.
  - `activeFilters: Set<'canada'|'international'|'religious'>` با پیش‌فرض هر سه روشن.
- **Fetch ماهانه**: هنگام تغییر ماه نمایش‌داده‌شده (`onMonthChange` از DayPicker) یا باز شدن دیالوگ، edge function با `{ month: 'YYYY-MM', lang }` فراخوانی شود.
- **ستون سوم (Month column)**:
  - هدر: نام ماه + ردیف ۳ آیکون فیلتر toggle:
    - 🍁 `Maple` (lucide `Leaf`) برای کانادا
    - 🌍 `Globe` برای بین‌المللی
    - ✝️ `Church` (یا `Sparkles`) برای دینی
    - هر آیکون با تیتلتیپ نام دسته (en/fa). کلیک = toggle. وقتی خاموش است opacity کم + خط روی آیکون.
  - بدنه: لیست scrollable از مناسبت‌های ماه که با `activeFilters` فیلتر شده‌اند، گروه‌بندی بر اساس روز:
    ```
    May 5
      ▸ Cinco de Mayo (سبز)
    May 11
      ▸ National Day for Truth... (سبز)
    ```
  - تیتر مناسبت با کلاس `text-emerald-400 hover:text-emerald-300 font-medium` (سبز در هر دو تم).
  - کلیک روی هر تیتر → `setSelectedDate(parsedDate)` → ستون وسط آن روز را نمایش می‌دهد (با cache روزانهٔ موجود).
- **حالت‌ها**: loading/error/empty مشابه ستون وسط.
- **i18n**: لیبل‌های فیلتر به `labels` اضافه شوند:
  - en: `{ canada: 'Canada', international: 'International', religious: 'Religious', monthTitle: 'This month' }`
  - fa: `{ canada: 'کانادا', international: 'بین‌المللی', religious: 'دینی', monthTitle: 'این ماه' }`
- **پاسخ‌گویی**: در صفحات کوچک‌تر، ستون سوم زیر بقیه برود (`grid-cols-1 md:grid-cols-[auto,1fr,1fr]`)، و `max-w-4xl` دیالوگ به `max-w-6xl` افزایش یابد.

## فنی (technical notes)
- پارس تاریخ ماه: از `selectedDate.getFullYear()` و `getMonth()`.
- DayPicker prop: `onMonthChange={(m) => setVisibleMonth(m)}` تا fetch ماهانه با اسکرول ماه‌ها هماهنگ شود.
- درخواست ماهانه ممکن است کندتر باشد؛ نشانگر loading جداگانه برای ستون ماه.
- در صورت رسیدن آیتم بدون `category` از مدل (fallback)، آن را در دستهٔ `international` قرار بده.

## خارج از scope
- پیش‌نشان کردن (dot/badge) روی روزهای دارای مناسبت در خود grid تقویم.
- ذخیرهٔ persistent مناسبت‌ها در دیتابیس.
- تفکیک ادیان (طبق پاسخ کاربر همه در یک دستهٔ «دینی» جمع می‌شوند).
