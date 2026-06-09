## هدف

پنل «Usage & credits» داده‌ها را فقط هنگام باز شدن یا با دکمهٔ Refresh دستی می‌گیرد. آن را **رئال‌تایم (آنی)** می‌کنیم تا به محض مصرف اعتبار، اعداد بدون نیاز به رفرش به‌روز شوند.

## وضعیت فعلی

در `src/modules/generator-ui/components/UsageStatsPopover.tsx`:
- `loadStats()` از `core_user_profiles`، `billing_user_quotas`، `billing_credit_transactions` و `generator_generation_jobs` می‌خواند.
- `loadCalendar()` تراکنش‌های ماه را می‌خواند.
- این‌ها فقط در `useEffect` هنگام `open` یا با کلیک Refresh اجرا می‌شوند.

هر چهار جدول از قبل در publication رئال‌تایم فعال هستند، پس **هیچ migration لازم نیست**.

## تغییرات (فقط فایل `UsageStatsPopover.tsx`)

### اشتراک رئال‌تایم
- یک `useEffect` جدید که فقط وقتی پاپ‌اور باز است (`open === true`) و کاربر لاگین است، یک کانال Supabase Realtime می‌سازد.
- روی این جدول‌ها با فیلتر `user_id=eq.<user.id>` (و برای پروفایل `id=eq.<user.id>`) به رویداد `*` گوش می‌دهد:
  - `billing_user_quotas` → با تغییر، `loadStats()` صدا زده می‌شود (مصرف امروز/ماه).
  - `core_user_profiles` → با تغییر، `loadStats()` (موجودی اعتبار).
  - `billing_credit_transactions` → با تغییر، هم `loadStats()` و هم `loadCalendar(viewMonth)` (مجموع خرج و تقویم).
  - `generator_generation_jobs` → با تغییر، `loadStats()` (تعداد ویدیوهای کامل‌شده).
- برای جلوگیری از فراخوانی‌های پی‌درپی، رفرش با یک debounce کوتاه (≈۳۰۰ms) انجام می‌شود.
- در cleanup، کانال با `supabase.removeChannel(channel)` بسته می‌شود (هنگام بستن پاپ‌اور یا unmount).
- چون `loadCalendar` به `viewMonth` وابسته است، وابستگی‌های `useEffect` شامل `open, user, viewMonth, loadStats, loadCalendar` می‌شود.

### نشانگر «Live» (اختیاری، کوچک)
- کنار عنوان «Usage & credits» یک نقطهٔ سبز کوچک با برچسب «Live» اضافه می‌شود تا کاربر بداند داده‌ها زنده‌اند. دکمهٔ Refresh دستی هم باقی می‌ماند.

## نتیجه
- به محض ساخت ویدیو یا کسر اعتبار، اعداد «CR spent»، «Balance»، «Today»، «This month» و تقویم خرج بلافاصله به‌روز می‌شوند، بدون رفرش دستی.

## جزئیات فنی
- فقط `UsageStatsPopover.tsx` ویرایش می‌شود؛ بدون تغییر بک‌اند یا schema.
- RLS موجود تضمین می‌کند کاربر فقط رویدادهای ردیف‌های خودش را دریافت کند؛ فیلتر `user_id` هم بار اضافی را کم می‌کند.
- اشتراک فقط هنگام باز بودن پاپ‌اور فعال است تا منابع هدر نرود.