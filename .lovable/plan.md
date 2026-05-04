هدف نهایی: هنگام رندر ویدیو، کاربر فقط «Rendering» نبیند؛ درصد پیشرفت، نوار پیشرفت، و متن «تقریباً چند درصد مانده» در کارت اصلی و history نمایش داده شود.

بررسی فعلی نشان می‌دهد که خروجی `jobs-get` فقط `status` را برمی‌گرداند و DashScope/Wan در پاسخ polling درصد واقعی ارائه نمی‌کند؛ فقط وضعیت‌هایی مثل `PENDING`، `RUNNING` و در انتها `SUCCEEDED/FAILED` دارد. بنابراین safest deterministic path این است که:
- اگر provider در آینده درصد واقعی داد، مستقیم همان را استفاده کنیم.
- برای Wan فعلی، یک progress تخمینی/محافظه‌کارانه بر اساس زمان سپری‌شده و status بسازیم که تا قبل از تکمیل به ۹۵٪ محدود شود و در لحظه completion به ۱۰۰٪ برسد.

محدودیت‌ها و ریسک‌ها:
- نباید وضعیت واقعی backend یا credit flow خراب شود.
- نباید ادعا کنیم درصد provider واقعی است وقتی API آن را نمی‌دهد؛ UI باید آن را به عنوان progress رندر نمایش دهد، اما backend آن را deterministic و bounded محاسبه کند.
- نباید polling را بسیار سریع کنیم تا هزینه/API pressure بالا نرود؛ interval فعلی ۴ ثانیه حفظ می‌شود.
- تغییر دیتابیس ضروری نیست؛ درصد را از status + created_at/updated_at در response محاسبه/برگردانده و در UI نمایش می‌دهیم.

Plan:

1. Backend contract را توسعه می‌دهم
- در `supabase/functions/_shared/modules/external-api-adapter/contract.ts` فیلد اختیاری `progressPercent?: number | null` به `GenerationPollResult` اضافه می‌شود.
- در `supabase/functions/_shared/modules/job-orchestrator/contract.ts` فیلدهای اختیاری `progress_percent` و در صورت نیاز `progress_label` به `JobSummary/JobDetail` اضافه می‌شود.
- در frontend contract متناظر `src/modules/job-orchestrator/contract.ts` همین فیلدها اضافه می‌شوند.

2. Progress تخمینی و قابل اعتماد برای Wan پیاده می‌شود
- در `external-api-adapter/service.ts` یک helper deterministic اضافه می‌شود:
  - `PENDING`: حدود 8 تا 18 درصد
  - `RUNNING`: بر اساس زمان سپری‌شده از `submit_time`/`created_at` تا سقف 95 درصد
  - `SUCCEEDED`: 100 درصد
  - `FAILED/CANCELED`: درصد آخر یا null، اما UI آن را failed نشان می‌دهد
- اگر DashScope در پاسخ آینده فیلدی مثل progress برگرداند، اولویت با مقدار واقعی خواهد بود؛ در غیر این صورت تخمین زمان‌محور استفاده می‌شود.
- برای video generation از مدت تقریبی محافظه‌کارانه استفاده می‌کنم تا progress خیلی سریع به 95 نرسد؛ مثلاً حدود 2 تا 4 دقیقه برای 5 ثانیه 720P، capped در 95٪ تا وقتی خروجی واقعی آماده شود.

3. `jobs-get` درصد را برمی‌گرداند
- در `job-orchestrator/gateway.ts` هنگام inline polling، مقدار `poll.progressPercent` در response جزئیات job inject می‌شود.
- حتی اگر job هنوز poll نشده باشد، یک helper در gateway از `created_at` و `status` یک fallback progress می‌سازد تا UI همیشه درصد داشته باشد.
- برای statusهای terminal:
  - completed → 100٪
  - failed/cancelled → بدون نوار موفقیت؛ label خطا نمایش داده می‌شود.

4. UI صفحه فعلی را به progress-aware تبدیل می‌کنم
در `src/modules/generator-ui/pages/DashboardPage.tsx`:
- helperهایی مثل `getRenderProgress(job)`، `formatProgressLabel(job)` و `getRemainingLabel(job)` اضافه می‌شود.
- کارت اصلی وسط صفحه هنگام `processing/pending` نشان می‌دهد:
  - عدد بزرگ: مثلا `46%`
  - نوار پیشرفت amber
  - متن: `Rendering • about 54% remaining`
- chip پایین کارت به جای فقط `Rendering`، مثلا `Rendering 46%` نشان می‌دهد.
- کارت‌های history هم نوار باریک progress و درصد کوچک خواهند داشت.
- برای completed، نوار 100٪ و video نمایش داده می‌شود.
- برای failed، پیام خطا/failed بدون progress گمراه‌کننده نمایش داده می‌شود.

5. رندر طولانی/گیرکرده را قابل فهم‌تر می‌کنم
- اگر job مدت زیادی processing بماند، label مثل `Still rendering — provider is taking longer than usual` نمایش داده می‌شود، نه اینکه کاربر فکر کند صفحه هنگ کرده است.
- polling interval فعلی حفظ می‌شود ولی هر response درصد جدید محاسبه و UI را update می‌کند.

6. Validation بعد از اجرا
بعد از approval و اعمال تغییرات:
- TypeScript/build توسط harness بررسی می‌شود.
- از preview مسیر فعلی `/` را با یک job processing بررسی می‌کنم.
- network response `jobs-get` باید شامل `progress_percent` باشد.
- UI باید در کارت اصلی و history درصد و نوار progress نشان دهد.

نکته مهم: این درصد برای Wan فعلی «تخمین کنترل‌شده بر اساس زمان و وضعیت provider» است، چون خود API درصد دقیق باقی‌مانده نمی‌دهد. اما برای تجربه کاربری، دقیقاً همان چیزی را فراهم می‌کند که لازم دارید: کاربر بفهمد رندر در چه مرحله‌ای است و حدوداً چقدر مانده.