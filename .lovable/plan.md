# پلن رفع اصولی خطای شروع ساخت ویدئو

## نتیجه نهایی مورد انتظار
- هنگام زدن دکمه ساخت ویدئو، UI دیگر با پیام مبهم `Network request failed while starting generation` متوقف نشود.
- job بلافاصله و امن ساخته شود، در ستون Pending قابل مشاهده باشد، و شروع واقعی تولید در بک‌گراند انجام شود.
- اگر provider کند، timeout، یا unreachable شود، job با پیام دقیق fail شود و credit به‌صورت امن refund شود.
- مسیرهای فعلی polling، progress، completed/failed، و نمایش کارت‌ها حفظ شوند.

## تشخیص فعلی
- پیام خطای دیده‌شده در UI از `generationStartErrorMessage` در `DashboardPage.tsx` می‌آید و وقتی fetch به edge function قبل از پاسخ‌گرفتن fail/timeout شود، به همین متن عمومی تبدیل می‌شود.
- `jobs-create` در حال حاضر provider start را داخل همان request انجام می‌دهد. این یعنی اگر provider یا network کند/قطع شود، کاربر قبل از اینکه کارت Pending قابل اتکا بگیرد با خطای network مواجه می‌شود.
- backend و database در بررسی سلامت سالم هستند؛ مشکل بیشتر از الگوی synchronous start در مسیر ساخت ویدئو است، نه خرابی کلی backend.

## تغییرات پیشنهادی

1. **تبدیل `jobs-create` به شروع asynchronous**
   - بعد از اعتبارسنجی، محاسبه هزینه، debit امن credit، و ساخت job، پاسخ سریع برگردد.
   - پاسخ شامل `jobId`, `status: "pending"`, provider/model و `requestId` باشد تا کارت فوراً در Pending دیده شود.
   - شروع provider در background با `EdgeRuntime.waitUntil(...)` انجام شود.

2. **افزودن تابع background امن برای start provider**
   - همان منطق فعلی `aiGateway.startGeneration` از request اصلی جدا شود.
   - اگر provider job id برگرداند: job به `processing` برود.
   - اگر provider همان لحظه ویدئو کامل برگرداند: ویدئو materialize و job `completed` شود.
   - اگر provider خطا داد یا job id نداد: job `failed` شود و credits refund شوند.
   - هیچ secret یا URL داخلی در پیام خطای کاربر لو نرود؛ پیام‌ها برای local/cloud provider تمیز و قابل فهم بمانند.

3. **حفظ سازگاری UI و contract**
   - `CreateJobResult.status` در frontend اجازه `pending` را دارد و کارت Pending فوراً ساخته می‌شود.
   - polling موجود (`getJob`) بدون تغییر اصلی، job را از pending → processing → completed/failed جلو می‌برد.
   - پیام خطای network در UI دقیق‌تر شود: اگر شروع request قطع شد، کاربر بداند generation ممکن است queue شده باشد و Pending refresh می‌شود، نه اینکه فقط retry کند.

4. **بهبود ریکاوری و لاگینگ**
   - برای start background، لاگ ساخت‌یافته با `requestId`, `jobId`, provider/model و نتیجه ثبت شود.
   - مسیرهای fail/refund همان RPC موجود را استفاده کنند تا credit ledger مستقیم دستکاری نشود.
   - stuck guards فعلی برای pending/processing حفظ شوند تا هیچ job برای همیشه گیر نکند.

5. **اعتبارسنجی**
   - تست edge function `jobs-create` به‌روزرسانی/افزوده شود تا ثابت کند:
     - پاسخ create سریع و `pending` است.
     - background start، job را processing/completed می‌کند.
     - خطای provider باعث failed + refund می‌شود.
   - تابع `jobs-create` deploy و با فراخوانی مستقیم backend تست شود.
   - در صورت امکان، یک ساخت ویدئو از preview بررسی شود که کارت Pending ایجاد و وضعیت آن polling می‌شود.

## فایل‌های تحت تأثیر
- `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`
- `supabase/functions/_shared/modules/job-orchestrator/contract.ts`
- `src/modules/job-orchestrator/contract.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx`
- احتمالاً تست‌های `supabase/functions/jobs-create/*test.ts`

## مواردی که نباید بشکند
- credit-management و ledger مستقیم دستکاری نمی‌شود.
- RLS/database schema تغییر نمی‌کند مگر در صورت ضرورت؛ برای این fix فعلاً migration لازم نیست.
- provider routing فعلی Wan/Flow/Local حفظ می‌شود.
- نمایش Pending، polling، progress، completed video و refund فعلی حفظ و فقط پایدارتر می‌شود.