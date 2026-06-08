## هدف
تکمیل و امن‌سازی تولید ویدئوی Local در Prompt Forge و حذف خطای:

```text
VALIDATION_ERROR: providerKey: Invalid enum value. Expected 'wan' | 'flow', received 'local'
```

## وضعیت فعلی (بررسی‌شده در کد)
بیشتر موارد درخواستی قبلاً در کد ریپو وجود دارد:
- `ProviderKey` در فرانت و بک‌اند شامل `"wan" | "flow" | "local"` است. ✓
- `CreateJobSchema` مقدار `providerKey: z.enum(["wan","flow","local"])` را می‌پذیرد. ✓
- مدل‌های `local/wan-2.1-i2v`، `local/wan-2.1-t2v`، `local/ltx-video-i2v`، `local/ltx-video-t2v` از طریق `providerKey="local"` مسیر‌دهی می‌شوند. ✓
- `resolveRoute` برای Local مقدار `estimatedCost = 0` برمی‌گرداند و `costCredits = Math.max(0, …)` صفر را اجازه می‌دهد. ✓
- پیام خطای امن برای روتر تنظیم‌نشده در gateway اضافه شده (`LOCAL_NOT_CONFIGURED`). ✓
- توابع `jobs-create` و `jobs-get` در نوبت قبل دوباره مستقر شدند. ✓

## دو شکاف واقعی باقی‌مانده
1. **هزینه واقعی Local هنوز ۰ نیست.** تابع دیتابیس `generator_start_job` این خط را دارد:
   `IF _cost IS NULL OR _cost < 1 THEN _cost := 1;`
   یعنی حتی وقتی `costCredits = 0` فرستاده می‌شود، RPC آن را به ۱ افزایش می‌دهد و ۱ اعتبار کسر می‌کند. برای رایگان‌بودن واقعی Local باید این رفتار اصلاح شود.
2. **`ai-gateway-route-preview` دوباره مستقر نشده.** نسخه‌ی live ممکن است هنوز قدیمی باشد.

## تغییرات پیشنهادی
1. **Migration برای `generator_start_job`**
   - تابع را طوری اصلاح می‌کنم که مقدار `_cost = 0` معتبر بماند و به ۱ افزایش نیابد (فقط مقادیر منفی/NULL به ۰ نرمال شوند).
   - بدین ترتیب job های Local عملاً ۰ اعتبار مصرف می‌کنند، در حالی‌که مسیر کسر اعتبار، duplicate-guard و quota برای مدل‌های ابری بدون تغییر باقی می‌ماند.

2. **هماهنگ‌کردن متن پیام خطای امن**
   - پیام کاربرپسند را به متن دقیق درخواستی تنظیم می‌کنم:
     «Local video generation is not configured yet. Configure the RTX video router or choose a cloud model.»
   - بدون افشای secret، URL خصوصی، نام env داخلی یا stack trace.

3. **استقرار مجدد توابع**
   - `ai-gateway-route-preview` (مورد جامانده)
   - `jobs-create` و `jobs-get` برای اطمینان از همگامی نهایی.

## تست‌های پذیرش
- درخواست مستقیم به `jobs-create` با `providerKey: "local"` و مدل `local/wan-2.1-i2v` دیگر `VALIDATION_ERROR` نمی‌دهد.
- وقتی روتر Local تنظیم نشده، پیام امن configuration برمی‌گردد (نه enum error).
- بررسی اینکه job های Local ۰ اعتبار کسر می‌کنند (با خواندن تراکنش‌های اعتبار/مانده).
- تست smoke یک مدل ابری (`wan` یا `flow`) برای اطمینان از نبود regression در validation و مسیر تولید.

## نکته
برای تولید واقعی ویدئو با مدل‌های Local، پروژه به یک روتر GPU محلی HTTPS نیاز دارد که به‌عنوان secret (مثل `LOCAL_VIDEO_BASE_URL`) تنظیم شود. این برنامه خطا را اصولی رفع و وضعیت نبودن روتر را شفاف می‌کند؛ در صورت داشتن آدرس روتر، اتصال واقعی Local هم قابل فعال‌سازی است.