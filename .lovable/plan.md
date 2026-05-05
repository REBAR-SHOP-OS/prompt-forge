## هدف
حالت "Image to Video" باید با هر تعداد عکس آپلود شده (یکی از Start یا End، یا هر دو) ساخت ویدئو را شروع کند و prompt روی همان عکس(ها) اعمال شود. الان در عمل خطای "Could not start video generation" برمی‌گردد.

## تشخیص

پس از بررسی کد:

- **فرانت‌اند درست ساخته شده است** (`DashboardPage.tsx`):
  - `framesSatisfied` اگر یکی از Start یا End ready باشد true می‌شود.
  - در `handleSubmit` سه شاخه برای: «هر دو»، «فقط Start» (i2v با firstFrame)، «فقط End» (T2V سپس append) وجود دارد.

- **بک‌اند هم منطق درست دارد** (`job-orchestrator/gateway.ts`):
  - فقط حالت "lastFrameUrl بدون firstFrameUrl" رد می‌شود — بقیه قبول می‌شوند.
  - در `external-api-adapter/service.ts` تابع `startWanI2V` با تنها `first_frame` (بدون last) هم payload می‌سازد.

- **مشکل واقعی**: پیام خطای "Could not start video generation" پیام عمومی است که فقط زمانی نشان داده می‌شود که خطا instance از `ApiError` نباشد. یعنی یا یک خطای جاوااسکریپتی قبل از فراخوانی API است یا خطا از نوع دیگری است. همچنین `console.error` نداریم پس نمی‌توانیم در DevTools ببینیم.

- **احتمال بسیار قوی**: همه jobهای موفق i2v در دیتابیس هم Start و هم End دارند. هیچ مورد فقط-Start تستی نشده. مدل پیش‌فرض `wan2.7-i2v-2026-04-25` ممکن است سمت ارائه‌دهنده Wan با تنها `first_frame` خطا برگرداند که در آن صورت بک‌اند خطای `PROVIDER_ERROR` می‌دهد و فرانت‌اند هم باید آن را نشان دهد. ولی پیام عمومی نشان داده می‌شود — یعنی خطا قبل از API است یا چیز دیگری در راه است.

## برنامه اجرا

### 1. شفاف کردن پیام خطا (`src/modules/generator-ui/pages/DashboardPage.tsx`)

در `handleSubmit` بلاک catch:
- لاگ کردن خطای واقعی به console (`console.error`) تا در DevTools/console قابل دیدن باشد.
- اگر خطا `ApiError` نیست ولی یک `Error` معمولی است، پیام واقعی آن نمایش داده شود به جای پیام عمومی.

### 2. تضمین رفتار «فقط یک عکس کافی است»

- پیام راهنمای `blockedReason` که الان «Add a Start or End frame image» را به انگلیسی می‌گوید را به فارسی تبدیل کنیم: «حداقل یک عکس Start یا End اضافه کنید.»
- پیام راهنمای دیگر: «Describe the motion for the frame(s).» → «حرکت یا تغییری که می‌خواهی روی عکس اعمال شود را توصیف کن.»

### 3. اطمینان از این که پرامپت روی عکس‌ها اعمال می‌شود

منطق فعلی در `handleSubmit` صحیح است:
- `nextPrompt = buildPromptWithUploadedFiles(promptText.trim(), uploadedFiles)` پرامپت کاربر را با ضمیمه فهرست فایل‌ها ارسال می‌کند.
- این `nextPrompt` به همراه `firstFrameUrl`/`lastFrameUrl` به `jobOrchestratorGateway.createJob` پاس می‌شود.
- بک‌اند آن را به API Wan می‌دهد. تغییری اینجا لازم نیست.

### 4. (اگر پس از تست خطا از Wan بود) مدل i2v پشتیبان

اگر بعد از مرحله ۱ مشخص شد که Wan با تنها first_frame مدل `wan2.7-i2v-2026-04-25` را قبول نمی‌کند، در شاخه «فقط Start» فرانت‌اند `requestedModel: 'wan2.7-i2v-2026-04-25'` صریح ارسال نکنیم (همان رفتار فعلی) ولی اگر خطای ارائه‌دهنده برگشت، آن را به کاربر نمایش بدهیم. در بک‌اند هم می‌توان در صورت نبود last_frame، یک fallback ساده اضافه کرد.

## محدوده تغییر
- فقط فایل `src/modules/generator-ui/pages/DashboardPage.tsx`، در دو نقطه:
  - بلاک `catch` تابع `handleSubmit`
  - متن‌های فارسی در `blockedReason`

## اعتبارسنجی پس از اجرا
1. در حالت Image to Video، فقط یک عکس Start آپلود کن و یک پرامپت بنویس → Submit. در صورت خطا، پیام دقیق (مثل `PROVIDER_ERROR: ...`) در composer نمایش داده شود و در console هم لاگ شود.
2. فقط End آپلود کن → ساخت باید شروع شود (T2V + append).
3. هر دو آپلود کن → باید مثل قبل کار کند.
4. هیچ عکس آپلود نکن → پیام راهنمای فارسی نمایش داده شود.