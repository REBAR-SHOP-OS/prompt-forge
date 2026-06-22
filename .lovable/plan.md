## نتیجه مورد انتظار
ساخت ویدئو با تصویر Start/End آپلودشده بدون خطای `INVALID_FIRST_FRAME_URL` انجام شود، در حالی که backend فقط فریم‌های متعلق به همان کاربر و همان bucket مجاز را بپذیرد.

## ریشه مشکل
فرانت‌اند برای نمایش درست preview، آدرس فریم‌های private bucket `wan-frames` را به signed URL تبدیل می‌کند. اما اعتبارسنجی backend در `job-orchestrator/gateway.ts` هنوز ابتدا URL را فقط با prefix عمومی `/object/public/wan-frames/` مقایسه می‌کند؛ بنابراین signed URL معتبر با مسیر `/object/sign/wan-frames/{userId}/...` قبل از رسیدن به چک مالکیت رد می‌شود.

## پلن اصلاح امن
1. **اصلاح اعتبارسنجی URL فریم در backend**
   - منطق `isAllowedFrameUrl` را طوری تغییر می‌دهم که ابتدا origin فضای ذخیره‌سازی خود پروژه را بررسی کند.
   - سپس فقط این دو مسیر را مجاز بداند:
     - `/storage/v1/object/public/wan-frames/{userId}/...`
     - `/storage/v1/object/sign/wan-frames/{userId}/...`
   - مسیر باید دقیقاً با `userId` کاربر authenticated شروع شود؛ URL کاربر دیگر، bucket دیگر، host دیگر، یا پروتکل غیر HTTPS رد می‌شود.

2. **شفاف‌سازی پیام خطا**
   - متن خطا را از “public wan-frames upload” به پیام دقیق‌تر مثل “your own wan-frames upload” تغییر می‌دهم تا با signed URL هم سازگار باشد.

3. **حفظ امنیت bucket**
   - bucket را public نمی‌کنم.
   - bypass امنیتی یا پذیرش URL آزاد اضافه نمی‌کنم.
   - فقط signed/public URLهای متعلق به همان کاربر در bucket مشخص پذیرفته می‌شوند.

4. **Deploy و تست هدفمند Edge Function**
   - فقط function مربوط به ساخت job را deploy می‌کنم.
   - با یک درخواست مشابه همان payload خطادار تست می‌کنم که خطای `INVALID_FIRST_FRAME_URL` دیگر رخ ندهد.
   - لاگ function را بررسی می‌کنم تا مطمئن شویم خطا از مسیر اعتبارسنجی برطرف شده و مشکل جدیدی ایجاد نشده است.

## فایل‌های درگیر
- `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`

## ریسک‌ها و کنترل‌ها
- **ریسک امنیتی پذیرش signed URL نامعتبر:** با محدود کردن origin، bucket و prefix شامل `userId` کنترل می‌شود.
- **ریسک شکستن preview:** فرانت‌اند تغییر نمی‌کند؛ signed URL همچنان برای نمایش thumbnail باقی می‌ماند.
- **ریسک اثر روی سایر مدل‌ها:** تغییر فقط روی اعتبارسنجی frame URL در مسیر ساخت job اعمال می‌شود.