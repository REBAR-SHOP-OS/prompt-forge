
# پلن مدیریت هزینه‌ها — ۵ لایه

سقف پیش‌فرض روزانه: **$15 معادل کردیت per-user** (قابل override توسط ادمین).

> نکته: rate limiting سنتی در backend پشتیبانی نمی‌شود؛ به‌جای آن از **سقف مصرف روزانه (quota)** و **duplicate-guard** استفاده می‌کنیم که اثر مشابه دارد و امن‌تر است.

---

## لایه ۱ — اصلاح حسابداری کردیت (بحرانی)

**مشکل:** RPC `generator_start_job` فقط job می‌سازد و کردیت کم نمی‌کند. به همین دلیل ۲۹۶ ویدئو ساخته شد ولی فقط ۵۰ کردیت ثبت شد.

**تغییرات:**
- بازنویسی `generator_start_job` تا:
  1. balance فعلی را چک کند، اگر کافی نیست → `insufficient_credits`.
  2. `credits_balance` را به‌اندازه‌ی `_cost` کم کند.
  3. ردیف در `billing_credit_transactions` با `type='spend'` و `job_id` ثبت کند.
- محاسبه‌ی هزینه‌ی واقعی در `external-api-adapter/service.ts`:
  - Veo Standard: `duration × 0.40 × 100` کردیت (۱ کردیت = $0.01)
  - Veo Fast: `duration × 0.10 × 100`
  - Wan: ثابت ~۱۵ کردیت
- برای کلیپ‌های ۱۰/۱۵ ثانیه (extension) → cost ضرب در ۲.
- `generator_fail_job` از قبل refund می‌کند (✅ موجود است).

## لایه ۲ — Quota روزانه per-user

**جدول جدید `billing_user_quotas`:**
```
user_id uuid PK
daily_limit_credits int default 1500   -- $15
monthly_limit_credits int default 30000 -- $300
used_today int default 0
used_this_month int default 0
last_reset_day date
last_reset_month date
```

- RPC جدید `check_and_reserve_quota(_user_id, _cost)` که در ابتدای `generator_start_job` صدا زده می‌شود.
- اگر `used_today + cost > daily_limit` → reject با پیام «سقف روزانه‌ی $15 رد شد».
- reset خودکار با مقایسه‌ی تاریخ.
- ادمین در داشبورد می‌تواند per-user limit را override کند.

## لایه ۳ — تغییر مدل پیش‌فرض به ارزان‌تر

**در `external-api-adapter/service.ts`:**
- `flow-video-1` → **Veo 3 Fast** ($0.10/s) به‌جای Veo 3.1 Standard ($0.40/s).
- ایجاد modelKey جدید `flow-video-1-pro` برای کاربرانی که explicit کیفیت بالا می‌خواهند.
- در UI (`VideoToVideoDialog` و فرم اصلی)، toggle "کیفیت استاندارد / بالا" با نمایش قیمت تخمینی per-second.
- پیش‌فرض duration: 5s (نه 10s).

**اثر:** ~۷۵٪ کاهش هزینه برای تولیدهای معمولی.

## لایه ۴ — Duplicate-Guard (جایگزین rate limit)

در `generator_start_job`:
- محاسبه‌ی `hash(user_id + prompt + first_frame_url + last_frame_url)`.
- اگر job مشابه در ۶۰ ثانیه‌ی گذشته با همین hash وجود دارد → reject با «این درخواست همین الان ارسال شد».
- جلوگیری از double-click و loop accidental روی Apply AI edit.

## لایه ۵ — داشبورد و Alert ادمین

**در `admin-monitor`:**
- صفحه‌ی جدید `/admin/costs`:
  - کارت‌های «امروز / هفته / ماه» — جمع `estimated_cost` از `audit_api_request_logs` به تفکیک `provider_key`.
  - جدول top-10 کاربر پرمصرف با ستون‌های: ایمیل، تعداد job، ثانیه، دلار، quota فعلی.
  - دکمه per-user: تنظیم daily/monthly limit.
- Edge function `cost-alert` با `pg_cron` (روزانه ۹ صبح):
  - اگر هزینه‌ی روز قبل > آستانه (پیش‌فرض $50) → ثبت در `audit_audit_logs` با action `cost_alert` و metadata.
  - (اختیاری: ارسال ایمیل از طریق Resend اگر کاربر بخواهد)

---

## ترتیب اجرا و فایل‌های اصلی

| مرحله | فایل‌ها |
|---|---|
| ۱. Migration | `billing_user_quotas` جدول + بازنویسی RPCهای `generator_start_job`, افزودن `check_and_reserve_quota` |
| ۲. Backend | `supabase/functions/_shared/modules/external-api-adapter/service.ts` (cost calculator + Veo Fast mapping) |
| ۳. Backend | `_shared/modules/job-orchestrator/service.ts` (پاس‌دادن cost واقعی به createJob) |
| ۴. Backend | Edge function جدید `cost-alert` + cron |
| ۵. Frontend | `VideoToVideoDialog.tsx` + فرم اصلی (toggle کیفیت + نمایش قیمت) |
| ۶. Frontend | `admin-monitor/pages/AdminPage.tsx` → صفحه‌ی costs |

---

## تخمین صرفه‌جویی

- فقط لایه ۳: ~۷۵٪ کاهش = اگر سال قبل $600 بود، می‌شد ~$150.
- لایه ۱+۲: جلوی سواستفاده‌ی نامحدود را می‌گیرد (سقف سخت $15/day/user).
- لایه ۵: شفافیت کامل برای ادمین.

## ریسک‌ها

- اصلاح RPC `generator_start_job` روی production — باید دقیق تست شود تا job ساخت نشکند.
- کاربرانی که با کردیت کم مواجه می‌شوند نیاز به UI شفاف برای top-up دارند (در این پلن شامل نیست — جدا اگر خواستی).
- تغییر مدل پیش‌فرض به Fast ممکن است کیفیت visual را کمی کاهش دهد؛ toggle "Pro" این را جبران می‌کند.
