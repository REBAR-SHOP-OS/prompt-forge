# حل ریشه‌ای ارور LOCAL_NOT_CONFIGURED

## ریشه‌ی واقعی مشکل
کد اپ کاملاً درست و کامل است. وقتی مدل «Local Wan 2.1» انتخاب می‌شود، تابع `readLocalVideoConfig()` در
`supabase/functions/_shared/modules/external-api-adapter/service.ts` دنبال متغیر محیطی
`LOCAL_VIDEO_BASE_URL` می‌گردد. چون این secret وجود ندارد، پیام
«Local video generation is not configured yet…» برمی‌گردد. این خطا = «هنوز تنظیم نشده»، نه باگ.

سه چیز برای اجرای واقعی لازم است که **هیچ‌کدام هنوز فراهم نیست**:

1. روی باکس RTX 4090 یک سرور HTTP باید این دو endpoint سبک (OpenAI-style) را ارائه دهد:
   - `POST {BASE}/v1/videos/generations`
   - `GET  {BASE}/v1/videos/generations/{id}`
2. این سرور باید از اینترنت قابل دسترسی باشد (edge functionها در ابر اجرا می‌شوند).
3. مقدار `LOCAL_VIDEO_BASE_URL` باید به آدرس عمومی همان سرور تنظیم شود.

آدرسی که در history داده شده (`rebarshop.tail669f65.ts.net`) فقط هاست **SSH روی Tailnet** برای NAS است؛
نه API ویدیو است و نه از ابر resolve می‌شود. پس قابل استفاده برای این کار نیست.

## قرارداد API که باکس RTX باید رعایت کند
درخواست ساخت (همان چیزی که کد ارسال می‌کند):
```text
POST {BASE}/v1/videos/generations
{
  "model": "local/wan-2.1-i2v",
  "prompt": "...",
  "image_url": "<first frame or null>",
  "first_frame_url": "...", "last_frame_url": "...",
  "duration": 5, "duration_seconds": 5,
  "aspect_ratio": "16:9",
  "response_format": "url"
}
```
پاسخ قابل قبول (هرکدام): یا `{"video_url": "..."}` (همگام) یا یک شناسه‌ی job مثل
`{"id": "..."}` / `{"task_id": "..."}` و سپس poll روی
`GET {BASE}/v1/videos/generations/{id}` که در نهایت `video_url` و وضعیت برمی‌گرداند.
اگر هدر احراز هویت می‌خواهد، در secret جداگانه‌ی `LOCAL_VIDEO_API_KEY` گذاشته می‌شود
(به صورت `Authorization: Bearer ...` ارسال می‌شود).

## روش پیشنهادی برای دسترسی عمومی: Tailscale Funnel
چون از قبل Tailscale دارید، تمیزترین راه (بدون باز کردن پورت روی روتر) این است:
روی باکس RTX سرور ویدیو را مثلاً روی پورت `8080` اجرا کنید، سپس:
```text
tailscale funnel 8080
```
این یک URL عمومی HTTPS می‌دهد مثل
`https://<machine>.tail669f65.ts.net` که از ابر قابل دسترسی است (برخلاف SSH، Funnel برای HTTP عالی کار می‌کند).
مقدار `LOCAL_VIDEO_BASE_URL` همان URL خواهد بود (کد به‌صورت خودکار `/v1` را اضافه می‌کند، پس فقط ریشه را بدهید).
جایگزین: DDNS + Port Forward روی روتر و دادن `https://your-ddns:port`.

## کارهایی که در این پروژه انجام می‌دهم
1. **secret تنظیم می‌کنم:** `LOCAL_VIDEO_BASE_URL` (و در صورت نیاز `LOCAL_VIDEO_API_KEY`) را با ابزار secret اضافه می‌کنم — به محض اینکه URL عمومی RTX را بدهید.
2. **تست end-to-end:** با `supabase--curl_edge_functions` یک job مدل `local/wan-2.1-i2v` می‌سازم و لاگ‌های edge function را بررسی می‌کنم تا اتصال و قرارداد API تأیید شود.
3. **بهبود UX حالت پیکربندی‌نشده (`DashboardPage.tsx`):** تا وقتی local پیکربندی نشده، آیتم‌های Local Wan/LTX در منو به‌صورت واضح «Not configured» نشان داده شوند (disabled + توضیح کوتاه) به‌جای اینکه کاربر کلیک کند و به ارور بخورد. وقتی secret ست شد، خودکار فعال می‌شوند.

## بخش فنی
- فایل‌های دخیل: `service.ts` (فقط خواندن config — بدون تغییر منطق)، `gateway.ts` (مسیر local درست است)، `DashboardPage.tsx` (فقط بهبود نمایش منو).
- بدون تغییر دیتابیس؛ مدل‌های local هزینه‌ی صفر دارند و قبلاً در migration مجاز شده‌اند.
- مدل‌ها در `LOCAL_VIDEO_MODELS` با id های فرانت‌اند یکی هستند؛ مشکل mapping وجود ندارد.

## چیزی که از شما لازم است
URL عمومی HTTPS سرور ویدیوی RTX (مثلاً خروجی `tailscale funnel`).
بدون این آدرس قابل دسترس از اینترنت، اجرای واقعی local از ابر ممکن نیست — این محدودیت زیرساخت است، نه کد.
