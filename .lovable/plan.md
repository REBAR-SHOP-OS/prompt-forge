## هدف

وقتی کاربر در حالت معمولی (Text-to-Video یا Image-to-Video) دکمه‌ی ۴۵s را انتخاب کرده و یک پرامت می‌نویسد، باید **فقط یک کارت** در ستون Pending ساخته شود (نه ۳ کارت ۱۵ ثانیه‌ای فعلی) و یک جاب واحد با مدت‌زمان درخواستی ۴۵ ثانیه ثبت شود.

## وضعیت فعلی (مشکل)

در `src/modules/generator-ui/pages/DashboardPage.tsx` خطوط ۲۱۹۰–۲۲۷۴ داخل `handleSubmit`:

```ts
const iterations = durationSeconds === 45 ? 3 : 1
const perClipDuration = durationSeconds === 45 ? 15 : durationSeconds
for (let i = 0; i < iterations; i++) { /* createJob ... */ }
```

نتیجه: برای ۴۵s، سه جاب جداگانه‌ی ۱۵s ساخته می‌شود و سه کارت در Pending ظاهر می‌شود.

## محدودیت پراوایدرها (مهم)

- **Veo (Flow)**: تک‌فراخوانی ۸s، با extension حداکثر ۱۶s (`VEO_EXTENDED_DURATION_SECONDS = 16` در `service.ts` خط ۳۵۰). از ۴۵s پشتیبانی نمی‌کند.
- **Wan**: contract فقط `5 | 10 | 15` می‌پذیرد.

پس «یک جاب ۴۵s مستقیماً به پراوایدر» در سطح خود پراوایدر غیرممکن است. نزدیک‌ترین تفسیر امن و سازگار با نیت کاربر:

> **یک ردیف جاب در DB با `requested_duration = 45` و یک کارت در UI ساخته شود.** زنجیر کردن داخلی پراوایدر (در صورت نیاز برای رساندن طول کلیپ به ۴۵s) به‌عنوان جزئیات پیاده‌سازی پنهان می‌ماند و بعداً در یک پلن جدا بررسی می‌شود.

این پلن فاز ۱ است: **فقط رفتار UI/جاب-سینگل** را تغییر می‌دهد. خروجی واقعی همان طول‌محدود پراوایدر (۸ تا ۱۶s برای Veo) خواهد بود؛ کارت در Pending با برچسب «45s» نمایش داده می‌شود و یک جاب واحد در DB با `requested_duration: 45` ثبت می‌شود.

## تغییرات

### ۱) Frontend — `DashboardPage.tsx` (خط ۲۱۹۰–۲۱۹۱ و حلقه)

- حذف منطق `iterations = 3` و `perClipDuration = 15`.
- ارسال یک `createJob` واحد با `durationSeconds: durationSeconds` (شامل ۴۵).

### ۲) Contract — `src/modules/job-orchestrator/contract.ts`

- گسترش `CreateJobInput.durationSeconds` از `5 | 10 | 15` به `5 | 10 | 15 | 45`.

### ۳) Backend contract & service

- `supabase/functions/_shared/modules/job-orchestrator/contract.ts`: `durationSeconds: 5 | 10 | 15 | 45 | null`.
- `supabase/functions/_shared/modules/external-api-adapter/contract.ts`: همان گسترش روی `GenerationStartInput.durationSeconds`.
- `service.ts` Veo (خطوط ۵۱۷–۵۴۹): مقدار `requested = 45` فعلاً به همان مسیر `willExtend` مپ شود (targetDuration = 16). یعنی ردیف DB با `requested_duration=45` ذخیره می‌شود اما خروجی واقعی همچنان ۱۶s است. این محدودیت در یک پلن جدا برای زنجیر کردن چندمرحله‌ای رسیدگی می‌شود.
- edge function `jobs-create/index.ts`: ولیدیشن ورودی به `[5,10,15,45]` گسترش یابد.

### ۴) نمایش کارت

کارت Pending فعلی برچسب طول‌اش را از `requested_duration` می‌خواند، پس وقتی ۴۵ ذخیره شود، کارت همان «45s» نمایش می‌دهد بدون تغییر اضافه.

## خارج از اسکوپ این پلن

- زنجیر کردن واقعی Veo برای رسیدن به ۴۵s خروجی.
- تغییر در رفتار Final Film / merge.
- تغییر در رفتار کارت‌های عکس یا soundtrack/voiceover.
- محاسبه‌ی credit برای ۴۵s (در صورت لزوم، در پلن بعدی).

## راستی‌آزمایی

1. انتخاب ۴۵s + Text-to-Video + نوشتن پرامت → فقط **یک کارت** در Pending ظاهر شود.
2. در DB ردیف `generator_generation_jobs.requested_duration = 45`.
3. سایر حالت‌ها (5/10/15s) مثل قبل کار کنند (یک کارت، یک جاب).
4. حالت Scenario writer (چندصحنه‌ای) دست‌نخورده باقی بماند.
