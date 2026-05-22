
## تشخیص خطا

از روی لاگ‌های سرور و سشن کاربر، اتفاقی که افتاده این است:

**سرور همه‌چیز را قبول کرده.** در `audit_api_request_logs` تمام ۵ فراخوانی `createJob` با وضعیت `200` ثبت شده‌اند — هیچ خطای rate-limit، insufficient-credit یا گذرواژه‌ای روی سرور رخ نداده. پس مشکل از edge function نیست.

**خطا در سمت کلاینت، بین صحنه‌ها رخ می‌دهد** — یعنی در زنجیر کردن کارت‌ها به یکدیگر. در `submitScenesAsJobs` بعد از هر کارت، تابع `waitForLastFrameUrl` صدا زده می‌شود تا فریم آخر ویدئوی قبلی استخراج، در Storage آپلود و به‌عنوان `firstFrameUrl` صحنه بعدی ست شود. این مرحله بین صحنه ۴ و ۵ شکست خورده است. علت‌های محتمل به ترتیب احتمال:

1. `captureLastFrameAsBlob` با `crossOrigin='anonymous'` ویدئوی پراکسی‌شده را می‌کشد و روی canvas می‌کشد. اگر هدر CORS کامل نباشد، canvas tainted می‌شود و `canvas.toBlob` با `SecurityError` می‌میرد.
2. آپلود PNG به باکت `FRAMES_BUCKET` با خطای Storage برمی‌گردد (مثلاً سهمیه/policy).
3. ویدئوی صحنه قبلی به موقع کامل نشده یا `storage_path` در ریسپانس `getJob` خالی بوده.

**چرا پیام «Could not start video generation» مبهم است:**
`submitScenesAsJobs` خودش پیام دقیق را در `composerError` می‌گذارد و سپس خطا را re-throw می‌کند. ولی `handleSubmit` در `catch` بیرونی **مجدداً** پیام را روی پیام عمومی «Could not start video generation.» بازنویسی می‌کند. به همین خاطر کاربر علت واقعی را نمی‌بیند.

```text
handleSubmit
  └─ submitScenesAsJobs  ← خطا اینجا رخ می‌دهد و پیام دقیق ست می‌شود
  └─ catch ← پیام دقیق را با پیام عمومی overwrite می‌کند ❌
```

---

## برنامه رفع مشکل

### ۱) ماسک نشدن پیام واقعی (اولویت اول)
در `src/modules/generator-ui/pages/DashboardPage.tsx` / `handleSubmit`:
- وقتی به شاخه auto-split (۴۵s یا ۱۳۵s) رفتیم و `submitScenesAsJobs` خطا داد، خطای آن را re-throw نکنیم *یا* در `catch` بیرونی، پیام `composerError` فعلی را اگر پر است حفظ کنیم و فقط در صورتی پیام عمومی بگذاریم که خالی باشد.

### ۲) خطای دقیق در `waitForLastFrameUrl`
- `console.error` با تفکیک «download»، «canvas tainted»، «storage upload» اضافه شود تا در ران بعدی علت دقیق در کنسول دیده شود.
- خطاهای `captureLastFrameAsBlob` با پیام شامل نام صحنه و علت پایه دوباره throw شوند (مثل: `Scene 4: could not capture last frame (tainted canvas)`).

### ۳) مسیر امن‌تر برای فریم آخر
به‌جای کشیدن canvas از ویدئو، اول از `JobDetail.last_frame_url` که سرور هنگام تکمیل job می‌نویسد استفاده کنیم؛ فقط اگر null بود، به روش canvas برگردیم. این کار «tainted canvas» را در حالت نرمال کاملاً دور می‌زند.

### ۴) اطمینان CORS روی پراکسی ویدئو
کوتاه چک کنیم edge function `video-proxy` هدر `Access-Control-Allow-Origin: *` و `Access-Control-Expose-Headers` و کش CORS را برمی‌گرداند. اگر نه، اضافه شود — این مشکل اصلی tainted canvas را در ریشه حل می‌کند.

### فایل‌های هدف
- `src/modules/generator-ui/pages/DashboardPage.tsx` (handleSubmit catch + waitForLastFrameUrl + captureLastFrameAsBlob)
- در صورت نیاز: `supabase/functions/video-proxy/index.ts` برای CORS هدرها

### خارج از اسکوپ
- منطق پشتی job-orchestrator، کرئدیت‌ها، rate-limit (همه سالم‌اند).
- منطق `scenario-write` (صحنه‌ها درست تولید شده‌اند، ۴ کارت اول OK بوده).
