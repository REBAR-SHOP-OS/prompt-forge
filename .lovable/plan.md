## خروجی مورد انتظار
- خطای `PROVIDER_ERROR: The video provider could not start generation` هنگام پرامپت فارسی رفع شود.
- ساخت ویدئو با انتخاب‌های ۵، ۱۰ و ۱۵ ثانیه در Google Veo/Flow دوباره شروع شود.
- برای ۱۰ و ۱۵ ثانیه، state زنجیره extension به‌صورت durable و امن در `provider_job_id` ذخیره شود تا بعد از restart بک‌اند هم ادامه‌پذیر باشد.
- تغییرات محدود به مسیر تولید ویدئو باشد و جریان‌های history، upload، delete و final film دست‌نخورده بمانند.

## ریشه مشکل
در لاگ `jobs-create` خطای زیر دیده شد:

```text
Cannot encode string: string contains characters outside of the Latin1 range
```

این خطا از `encodeVeoState` در `supabase/functions/_shared/modules/external-api-adapter/service.ts` می‌آید. state مربوط به Veo شامل `prompt` است؛ وقتی prompt فارسی باشد، `btoa(JSON.stringify(state))` شکست می‌خورد چون `btoa` فقط Latin1 را قبول می‌کند. چون برای ۱۰/۱۵ ثانیه state زنجیره extension داخل `provider_job_id` ذخیره می‌شود، این شکست باعث می‌شود generation اصلاً شروع نشود.

## برنامه اجرا
1. در adapter بک‌اند، encoding/decoding state Veo را از `btoa/atob` مستقیم به UTF-8-safe base64url تغییر می‌دهم:
   - `TextEncoder` برای تبدیل JSON Unicode به bytes
   - base64url روی bytes
   - `TextDecoder` برای decode برگشتی
2. backward compatibility را حفظ می‌کنم:
   - providerJobIdهای جدید با فرمت `veo:v1:<base64url-json>` درست decode می‌شوند.
   - اگر decode fail شود، fallback فعلی به raw operation name همچنان باقی می‌ماند تا jobهای قدیمی نشکنند.
3. منطق duration را دقیق می‌کنم:
   - درخواست ۵ ثانیه برای Veo همچنان با کلیپ پایه ۸ ثانیه provider ساخته می‌شود، اما duration ثبت‌شده مطابق رفتار فعلی provider باقی می‌ماند مگر خروجی قابل برش/extension جداگانه لازم باشد.
   - درخواست‌های ۱۰ و ۱۵ ثانیه دیگر هنگام start fail نمی‌شوند و وارد زنجیره extension می‌شوند.
4. تست deterministic اضافه/اجرا می‌کنم برای adapter:
   - encode/decode state با prompt فارسی
   - حفظ مقدارهای `targetDuration`, `currentOp`, `prompt`
   - اطمینان از اینکه providerJobId فقط شامل base64url-safe characters است.
5. تابع `jobs-create` را deploy و با یک درخواست کوچک از مسیر edge تست می‌کنم که دیگر خطای Latin1 در لاگ نیاید.

## اعتبارسنجی
- لاگ `jobs-create` بعد از اصلاح نباید خطای Latin1 داشته باشد.
- ایجاد job با prompt فارسی و durationهای ۱۰/۱۵ باید حداقل به status `processing` برسد و `provider_job_id` داشته باشد.
- کد surrounding workflows تغییر نمی‌کند تا Final Film و Start Over تحت تأثیر قرار نگیرند.