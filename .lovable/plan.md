
## هدف

حذف کامل سیستم اعتبار (credit) از اپلیکیشن چون استفاده داخلی شرکت است و نیازی به محدود کردن کاربران نیست.

## رویکرد

به جای حذف فیزیکی جداول (که ریسک شکستن کد دارد)، از روش **«غیرفعال‌سازی منطقی»** استفاده می‌کنیم:
- بررسی موجودی credit در دیتابیس **حذف می‌شود**
- نمایش credit در UI **حذف می‌شود**
- جداول credit **باقی می‌مانند** (برای صورت نیاز در آینده، و جلوگیری از شکستن لاگ‌های قدیمی)

این کم‌ریسک‌ترین و قابل بازگشت‌ترین راه است.

---

## تغییرات

### ۱. دیتابیس (Migration)

**الف) تغییر تابع `generator_start_job`:**
- حذف بررسی `IF _balance < _debit THEN RAISE 'insufficient credits'`
- حذف کسر `credits_balance`
- حذف ثبت `billing_credit_transactions`
- فقط job را ایجاد می‌کند

**ب) تغییر تابع `generator_fail_job` (اگر هست):**
- حذف منطق refund

### ۲. Backend (Edge Functions)

**`supabase/functions/_shared/modules/job-orchestrator/gateway.ts`:**
- حذف منطق `INSUFFICIENT_CREDITS` (دیگر هرگز رخ نمی‌دهد)
- حذف پارامتر `estimatedCost`

**`supabase/functions/_shared/modules/job-orchestrator/service.ts`:**
- حذف فیلد `estimatedCost` از `createJob`

**`supabase/functions/_shared/modules/external-api-adapter/service.ts`:**
- حذف محاسبه `estimatedCost` از `resolveRoute` (یا برگرداندن صفر)

### ۳. Frontend

**`src/modules/job-orchestrator/gateway.ts`:**
- حذف منطق `SoftCreateJobError` و چک `INSUFFICIENT_CREDITS`

**`src/modules/generator-ui/pages/DashboardPage.tsx`:**
- حذف پیام خطای credit
- حذف هر نمایش موجودی credit در dashboard

**`src/core/ui/UserBadge.tsx`:**
- حذف نمایش `{profile.credits_balance} credits`

**`src/core/api/types.ts`:**
- حذف فیلد `credits_balance` از type `Me` (اختیاری، می‌توان نگه داشت)

**`src/modules/credit-management/`:**
- این ماژول می‌تواند کامل حذف شود یا غیرفعال بماند

---

## آنچه دست نخورده می‌ماند

- جداول `core_user_profiles.credits_balance`، `billing_credit_transactions` (تاریخچه حفظ می‌شود)
- ساختار auth، roles، storage، و سایر بخش‌های اپ
- ادمین همچنان می‌تواند در آینده credit بدهد اگر خواست

---

## نتیجه

پس از این تغییرات:
- هر کاربر می‌تواند **بی‌نهایت فیلم** بسازد
- هیچ خطای 402 یا "insufficient credits" دیگر رخ نمی‌دهد
- UI تمیزتر می‌شود (بدون credit badge)
- هزینه‌های واقعی Alibaba DashScope مستقیم از API key شما کسر می‌شود (که الان هم همینطور است)

---

## یادآوری مهم

⚠️ چون فیلم‌سازی هزینه واقعی روی **Alibaba DashScope** دارد، با حذف credit، هیچ محدودیتی در سمت اپ نیست. اگر کاربری زیاد فیلم بسازد، هزینه آن از حساب DashScope شما کسر می‌شود. چون اپ داخلی شرکت است این مشکلی ندارد، فقط آگاه باشید.

