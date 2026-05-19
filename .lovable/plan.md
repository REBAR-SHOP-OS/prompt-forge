## تشخیص دقیق مشکل

مشکل از خود رابط کاربری شروع نشده؛ UI فقط آن را بد نشان می‌دهد. مسیر فعلی این است:

1. کاربر یک job با مدل Wan 2.7 می‌سازد.
2. backend از DashScope یک `task_id` می‌گیرد و job را `processing` می‌کند.
3. `jobs-get` در هر poll از provider وضعیت را می‌پرسد.
4. تا وقتی provider هنوز `RUNNING` برگرداند، خروجی واقعی وجود ندارد و فقط یک درصد تخمینی نشان داده می‌شود.
5. در frontend تابع `getJobProgressPercent` بعد از زمان تخمینی، عمداً درصد را بین ۹۳ تا ۹۵ بالا/پایین می‌برد؛ برای همین عدد از ۹۵ به ۹۴ و حتی ۹۳ برمی‌گردد.
6. backend هم برای Wan سقف پیشرفت در حالت در حال اجرا را ۹۵ گذاشته، پس اگر provider دیر کند، کاربر روی ۹۵ گیر می‌بیند.

طبق مستندات DashScope، وضعیت task فقط این مسیر را دارد:

```text
PENDING -> RUNNING -> SUCCEEDED یا FAILED
```

و `video_url` فقط وقتی `SUCCEEDED` شود برمی‌گردد. پس تا قبل از آن، ۹۵٪ «درصد واقعی» نیست؛ فقط تخمین زمانی است.

## هدف نهایی

- درصد دیگر عقب‌گرد نکند.
- UI وانمود نکند که ۹۵٪ یعنی تقریباً تمام شده، وقتی provider هنوز در صف/رندر است.
- jobهای واقعاً گیرکرده تا ابد `processing` نمانند.
- وقتی provider خروجی داد، backend فوراً job را `completed` کند.
- وقتی provider task را گم/منقضی/نامعتبر کرد یا بیش از حد طول کشید، job با پیام واضح `failed` شود و اعتبار کاربر برگشت داده شود.

## تغییرات پیشنهادی

### 1. اصلاح نمایش درصد در frontend

در `src/modules/generator-ui/pages/DashboardPage.tsx`:

- منطق `breathing` که باعث برگشت عدد از ۹۵ به ۹۴/۹۳ می‌شود حذف می‌شود.
- درصد برای هر job monotonic می‌شود؛ یعنی در UI هیچ‌وقت کمتر از مقدار قبلی نمایش داده‌شده برای همان job نمی‌شود.
- برای jobهای طولانی، به جای نوسان درصد، پیام وضعیت تغییر می‌کند؛ مثل:
  - `Still rendering — provider is taking longer than usual.`
  - و درصد روی سقف امن می‌ماند، نه اینکه عقب برگردد.

### 2. افزودن تشخیص timeout/stuck در backend

در `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`:

- برای jobهای `processing` اگر مدت زیادی از `created_at` گذشته باشد و provider هنوز خروجی نداده باشد، job به صورت قطعی `failed` می‌شود.
- پیشنهاد سقف امن:
  - Wan 5s: حدود ۱۵ دقیقه
  - Wan 10s/15s یا مدل‌های کندتر: حدود ۳۰ دقیقه
- دلیل fail واضح ذخیره می‌شود، مثلاً:
  - `Video provider timed out before returning a result. Please try again.`
- با `generator_fail_job` اعتبار job برگشت داده می‌شود، چون خروجی تحویل داده نشده است.

### 3. سخت‌تر کردن polling سمت provider

در `supabase/functions/_shared/modules/external-api-adapter/service.ts`:

- اگر DashScope وضعیت `UNKNOWN` بدهد یا task عملاً منقضی/نامعتبر باشد، دیگر آن را مثل `pending` بی‌نهایت ادامه نمی‌دهیم.
- `UNKNOWN` برای taskهای قدیمی یا بدون خروجی به `failed` تبدیل می‌شود.
- خطاهای موقت شبکه/provider همچنان retry می‌شوند تا job بی‌دلیل fail نشود.
- progress تخمینی Wan از سقف ۹۵ به یک سقف پایین‌تر/محافظه‌کارانه‌تر مثل ۹۲ یا ۹۴ محدود می‌شود تا ۹۵ فقط نزدیک پایان واقعی حس نشود.

### 4. هماهنگ‌سازی قرارداد داده

در contractهای `JobSummary/JobDetail`:

- اگر لازم باشد یک فیلد سبک مثل `provider_status` یا `status_message` اضافه می‌شود تا UI به جای حدس‌زدن از روی درصد، وضعیت واقعی‌تری نشان دهد.
- اگر بدون تغییر schema کافی باشد، فقط از status و زمان موجود استفاده می‌کنیم تا مهاجرت دیتابیس لازم نشود.

### 5. اعتبارسنجی بعد از پیاده‌سازی

بعد از اجرای تغییرات:

- با `jobs-get` روی job فعلی بررسی می‌کنم که پاسخ backend پایدار و قابل فهم است.
- بررسی می‌کنم درصد UI دیگر از ۹۵ به ۹۴ برنگردد.
- سناریوی job طولانی را بررسی می‌کنم که یا completed شود، یا بعد از timeout به failed واضح تبدیل شود.
- لاگ‌های backend را بررسی می‌کنم تا مطمئن شویم خطای provider پنهان نمی‌شود.

## فایل‌های درگیر

- `src/modules/generator-ui/pages/DashboardPage.tsx`
- `supabase/functions/_shared/modules/external-api-adapter/service.ts`
- `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`
- در صورت نیاز فقط contractهای job، بدون تغییر دیتابیس مگر واقعاً لازم شود.

## نکته مهم

این تغییر باعث نمی‌شود provider خارجی سریع‌تر رندر کند، اما مشکل اصلی کاربر را ریشه‌ای حل می‌کند: دیگر job تا ابد با درصد فریبنده روی ۹۵ نمی‌ماند، درصد عقب‌گرد نمی‌کند، و اگر provider واقعاً خروجی ندهد، سیستم آن را سالم fail و refund می‌کند.