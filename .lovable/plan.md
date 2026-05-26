
## هدف
قبل از هر بار ساخت ویدئو، هزینه‌ی تخمینی (دلار + کردیت) براساس مدل انتخاب‌شده و مدت‌زمان به کاربر نمایش داده شود تا بداند چقدر مصرف می‌کند و سپس تأیید کند.

## دو لایه‌ی نمایش

### ۱) نشانگر همیشه‌فعال (Inline cost badge)
کنار دکمه‌ی Generate و کنار chip انتخاب مدل، یک برچسب کوچک اضافه می‌شود که به‌صورت لحظه‌ای هزینه را نشان دهد:

```
≈ $0.50 · 50 credits
```

محاسبه در فرانت با همان فرمول بک‌اند (`external-api-adapter/service.ts`):
- `flow-video-1` (Veo 3 Fast): `duration × $0.10` → کردیت = `duration × 10`
- `flow-video-1-pro` (Veo 3.1 Pro): `duration × $0.40` → کردیت = `duration × 40`
- `wan2.7-*`: ثابت `$0.15` → `15 credits`

این تابع به‌صورت یک util کوچک `estimateCost(model, durationSec)` در فایل dashboard اضافه می‌شود (یا اگر فایل common.ts موجود است، آنجا).

### ۲) دیالوگ تأیید قبل از submit
وقتی کاربر دکمه‌ی Generate را می‌زند، به‌جای ارسال مستقیم، یک `Dialog` (shadcn) باز می‌شود با محتوای:

```
Confirm generation
──────────────────
Model:       Google Veo 3 Fast
Duration:    5 seconds
Estimated:   $0.50  (50 credits)
Your balance: 1240 credits
                       [Cancel] [Generate]
```

اگر در مرحله‌ی Auto-split چند صحنه ساخته می‌شود (مثل ۳×۱۵s)، جمع کل صحنه‌ها نشان داده شود:
```
3 scenes × 15s × Veo 3 Fast = $4.50 (450 credits)
```

balance از `core_user_profiles.credits_balance` که قبلاً در state موجود است خوانده می‌شود.

اگر balance کمتر از هزینه باشد، دکمه‌ی Generate در دیالوگ disable می‌شود و پیام «Insufficient credits» نمایش داده می‌شود.

## گزینه‌ی Skip (اختیاری اما توصیه‌شده)
چک‌باکس «Don't ask again for this session» در دیالوگ. اگر تیک بخورد، در `sessionStorage` ذخیره می‌شود و تا بسته‌شدن tab دیالوگ نشان داده نمی‌شود (فقط inline badge باقی می‌ماند). به این شکل تجربه‌ی کاربر حرفه‌ای آزار نمی‌بیند ولی کاربر تازه‌کار هر بار هشدار می‌بیند.

## فایل‌های ویرایش‌شده
فقط یک فایل فرانت‌اند:
- `src/modules/generator-ui/pages/DashboardPage.tsx`
  - افزودن `estimateCost()` کنار `MODEL_CHOICES`
  - افزودن badge کنار chip مدل (نزدیک خط 6180)
  - افزودن state `pendingSubmit` و دیالوگ confirm
  - wrap کردن submit handler: اگر `sessionStorage` flag ست نیست → باز کردن دیالوگ به‌جای اجرای مستقیم
  - برای جریان Auto-split (`submitScenesAsJobs`) هزینه‌ی کل قبل از حلقه محاسبه و در همان دیالوگ نشان داده می‌شود

## بدون تغییر در بک‌اند
هیچ migration یا تغییر edge function لازم نیست. منطق دقیق کسر کردیت همان `generator_start_job` در بک‌اند می‌ماند (single source of truth). این فقط یک پیش‌نمایش UI است.

## ریسک
بسیار کم. فرمول‌ها با بک‌اند یکی هستند؛ اگر در آینده قیمت‌ها در بک‌اند عوض شود، تابع `estimateCost` باید به‌روز شود (در همان فایل و در `external-api-adapter/service.ts` کنار هم کامنت می‌گذاریم).
