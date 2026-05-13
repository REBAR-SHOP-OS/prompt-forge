## مشکل

در پنل History پیام «Could not refresh render status» ظاهر می‌شود در حالی‌ که render هنوز در حال انجام است (۹۵٪). با بررسی کد سه ریشهٔ واقعی پیدا شد، نه یک باگ سطحی:

### ریشهٔ ۱ — Polling شکننده با `Promise.all`
در `src/modules/generator-ui/pages/DashboardPage.tsx` (خطوط ۱۲۶۵–۱۲۷۶):
```ts
const refreshedJobs = await Promise.all(
  activeJobs.map((job) => jobOrchestratorGateway.getJob(job.id))
)
```
اگر **فقط یک** درخواست `getJob` به دلیل گذرا (cold-start ادج‌فانکشن، تایم‌اوت شبکه، ۴۰۱ ناشی از رفرش توکن، rate-limit) شکست بخورد، کل `Promise.all` reject می‌شود و پیام خطا ست می‌گردد، حتی اگر بقیهٔ jobها موفق بوده باشند.

### ریشهٔ ۲ — پیام خطا هرگز پاک نمی‌شود
`setVideoColumnMessage('Could not refresh render status.')` ست می‌شود ولی در poll‌های بعدیِ موفق هیچ‌جا `setVideoColumnMessage(null)` فراخوانی نمی‌شود. یک اشکال گذرا یک‌بار رخ می‌دهد و پیام تا بسته شدن صفحه باقی می‌ماند.

### ریشهٔ ۳ — درصد فقط زمان‌محور است (Math.min(95, …))
در تابع `getJobProgressPercent` (خط ۲۲۴) درصد بر اساس زمان سپری‌شده محاسبه و در سقف ۹۵٪ کلَمپ می‌شود. backend مقدار `progress_percent` واقعی برنمی‌گرداند و سرور هیچ‌وقت وضعیت provider (fal.ai) را poll نمی‌کند. در نتیجه برای job طولانی، نوار روی ۹۵٪ گیر می‌افتد و کاربر فکر می‌کند چیزی خراب شده — هر هیک‌آپ شبکه‌ای در همین لحظه هم پیام خطا را ظاهر می‌کند.

---

## راه‌حل اصولی (فقط فرانت‌اند، بدون تغییر backend)

### تغییرات در `src/modules/generator-ui/pages/DashboardPage.tsx`

**۱. Polling را به `Promise.allSettled` تبدیل کن**
فقط نتایج fulfilled مرج شوند؛ rejectedها نادیده گرفته شوند. هر job مستقل از بقیه آپدیت می‌شود.

**۲. شمارندهٔ خطای پیاپی + threshold**
یک `pollFailureCountRef = useRef(0)` اضافه شود.
- در هر poll، اگر **همهٔ** درخواست‌ها rejected شدند → counter++؛ در غیر این صورت → counter = 0 و `setVideoColumnMessage(null)` اگر پیام فعلی همان متن خطا بود.
- فقط وقتی `counter >= 3` (حدود ۱۲ ثانیه پشت سر هم خطا) پیام «Could not refresh render status.» نمایش داده شود.
- این نکته باعث می‌شود یک hiccup گذرا هرگز نویز ایجاد نکند.

**۳. Backoff تطبیقی برای jobهای طولانی**
به‌جای ثابت ۴ ثانیه:
```ts
const interval = Math.min(20_000, 4_000 + Math.floor(elapsedMs / 30_000) * 2_000)
```
بعد از ۳۰ ثانیه ۶s، بعد ۸s و … تا سقف ۲۰s. این هم بار سرور را کم می‌کند، هم احتمال شکست را پایین می‌آورد.

**۴. پاک‌سازی پیام در هر تغییر فاز موفق**
وقتی `refreshedJobs.length > 0`، اگر `videoColumnMessage` با متن خطای poll برابر بود، `setVideoColumnMessage(null)`.

**۵. (تنظیم کوچک UX) سقف درصد زمان‌محور**
در `getJobProgressPercent`، وقتی `elapsed > expectedMs` نوار «نفس‌زدن» (مثلاً نوسان ۹۲–۹۵٪) به‌جای کلَمپ سفت ۹۵٪، تا کاربر بداند فرایند هنوز زنده است. اختیاری ولی مؤثر.

### بدون تغییر در:
- `supabase/functions/jobs-get/*` — لاگ‌ها هیچ خطایی نشان نمی‌دهند، این edge function سالم است.
- backend service لایهٔ orchestrator — provider-status polling یک تغییر بزرگ‌تر است و خارج از این درخواست.

---

## تأیید پس از پیاده‌سازی
- تست‌سناریوی شکست گذرا: یک‌بار شبکه را در DevTools روی Offline بگذار، پس از یک poll دوباره Online کن — نباید پیام خطا ظاهر شود (counter ریست می‌شود).
- ۳ poll پیاپی Offline → پیام «Could not refresh render status.» ظاهر می‌شود.
- وقتی اتصال برمی‌گردد → پیام به‌طور خودکار حذف می‌شود.
- نوار رندر: حتی اگر خطای موقت رخ دهد، روند ادامه دارد و وقتی job واقعاً تمام شود به ۱۰۰٪ می‌پرد.