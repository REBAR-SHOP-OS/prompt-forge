## مشکل

نسخه منتشرشده در `aura-clip-studio.lovable.app` کاملاً سیاه است. در کنسول مرورگر این خطا رخ می‌دهد:

```
Uncaught Error: Missing Supabase environment variables.
Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before starting the app.
```

این خطا در زمان **بارگذاری ماژول** پرتاب می‌شود (در `src/integrations/supabase/client.ts`) و چون قبل از رندر شدن React اتفاق می‌افتد، کل برنامه crash می‌کند و فقط `<body>` خالی با پس‌زمینه تیره باقی می‌ماند.

## ریشه‌ی فنی

فایل `src/integrations/supabase/client.ts` که باید **به‌صورت خودکار با مقادیر هاردکد شده** تولید شود، به نسخه‌ای تغییر داده شده که مقادیر را از `import.meta.env.VITE_SUPABASE_URL` و `VITE_SUPABASE_PUBLISHABLE_KEY` می‌خواند.

- در محیط Sandbox پیش‌نمایش، فایل `.env` وجود دارد و مقادیر در دسترس‌اند → کار می‌کند.
- در زمان **بیلد production برای Publish**، آن `.env` همراه نیست؛ Vite مقادیر را به‌جای متغیرها `undefined` می‌گذارد → `throw` می‌کند → صفحه سفید/سیاه.

علاوه بر آن، `src/core/api/client.ts` و `src/modules/generator-ui/lib/proxiedVideoUrl.ts` نیز برای ساخت URL توابع از `VITE_SUPABASE_PROJECT_ID` استفاده می‌کنند که در production می‌شود `undefined` و باعث می‌شود همه فراخوانی‌های edge function به آدرس `https://undefined.supabase.co/...` بروند.

## راه‌حل اصولی

تمام مقادیر اتصال Supabase باید به صورت ثابت در سورس قرار گیرند (دقیقاً همان‌طور که قالب رسمی Lovable Cloud انجام می‌دهد). مقادیر anon key/URL از نظر امنیتی publishable هستند و قرار دادن‌شان در سورس استاندارد است.

### تغییرات

1. **`src/integrations/supabase/client.ts`** — بازگرداندن به فرم خودکار با مقادیر هاردکد (URL پروژه و anon key از تنظیمات Lovable Cloud). حذف بلاک `throw`.

2. **`src/core/api/client.ts`** — جایگزینی `import.meta.env.VITE_SUPABASE_PROJECT_ID` با مقدار ثابت `sacxoanuyetjfrfllkzx` تا مسیر `FUNCTIONS_BASE` همیشه معتبر باشد.

3. **`src/modules/generator-ui/lib/proxiedVideoUrl.ts`** — همان جایگزینی برای `PROJECT_ID` و `OWN_SUPABASE_HOST`.

### اعتبارسنجی

- اطمینان از اینکه پس از تغییر، فایل `client.ts` دیگر throw نمی‌کند.
- بررسی این که در نسخه پیش‌نمایش هم همچنان لاگین/داشبورد کار کند.
- پیشنهاد به کاربر برای زدن دکمه **Publish → Update** تا بیلد جدید جایگزین نسخه شکسته شود.

## محدوده

تغییرات فقط در سه فایل بالا انجام می‌شود؛ هیچ تغییری در منطق بیزنس، schema، یا edge functions اعمال نمی‌شود.
