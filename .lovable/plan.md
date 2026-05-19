## نتیجه مورد انتظار
ویدئوهای جدید، مخصوصاً حالت 45 ثانیه‌ای که از چند کلیپ 15 ثانیه‌ای ساخته می‌شود، دیگر در مرحله extension به خاطر خطای API fail نشوند و Jobهای فعلیِ fail شده به شکل کنترل‌شده قابل بازیابی باشند.

## علت دقیق مشکل
لاگ backend نشان داد هر سه کارت 45 ثانیه‌ای بعد از پایان مرحله اول Veo، هنگام extension fail شده‌اند:

```text
Veo extend 400 `numberOfVideos` isn't supported by this model.
```

یعنی اصلاح قبلی که `inlineData` را به `video.uri` تبدیل کرد درست بود، اما پارامتر `numberOfVideos` هنوز برای endpoint فعلی Veo 3.1 پشتیبانی نمی‌شود. طبق مستندات، extension باید با ویدئوی قبلی به صورت `video: { uri }` و پارامترهای محدود مثل `resolution: "720p"`, `aspectRatio`, و مدت معتبر اجرا شود؛ نه `numberOfVideos`.

## برنامه اصلاح

1. **اصلاح درخواست Veo extension**
   - در `supabase/functions/_shared/modules/external-api-adapter/service.ts` تابع `startVeoExtension` را اصلاح می‌کنم.
   - `numberOfVideos` حذف می‌شود.
   - پارامترهای extension به شکل سازگار با API تنظیم می‌شوند:
     - `resolution: "720p"`
     - `aspectRatio`
     - `durationSeconds: 8`
   - `video: { uri: phase1Uri }` حفظ می‌شود.

2. **جلوگیری از fail دائمی برای خطاهای قابل اصلاح/موقت Veo**
   - خطاهای 400 شناخته‌شده مربوط به پارامتر ناسازگار دیگر رخ نمی‌دهند.
   - خطاهای capacity/rate/temporary همچنان به شکل کنترل‌شده مدیریت می‌شوند تا Job بی‌دلیل گیر نکند یا fail مبهم ندهد.

3. **بازیابی کارت‌های همین اجرای فعلی**
   - بعد از deploy، Jobهای اخیر که فقط به خاطر همین خطای `numberOfVideos` fail شده‌اند را به `processing` برمی‌گردانم تا با provider_job_id موجود دوباره poll شوند و extension با درخواست اصلاح‌شده ادامه پیدا کند.
   - این کار فقط روی Jobهای اخیر همین خطای مشخص انجام می‌شود، نه همه Jobهای fail شده.

4. **اعتبارسنجی واقعی**
   - edge functionهای مرتبط (`jobs-get` و در صورت نیاز `jobs-create`) deploy می‌شوند.
   - لاگ‌های `jobs-get` دوباره بررسی می‌شوند تا مطمئن شویم خطای `numberOfVideos` دیگر تکرار نمی‌شود.
   - وضعیت Jobهای اخیر از database خوانده می‌شود تا مطمئن شویم از `failed` خارج شده و به مسیر `processing/completed` برگشته‌اند.

## محدوده تغییر
- فقط مسیر backend تولید/extension ویدئو اصلاح می‌شود.
- UI، سناریونویسی، موزیک، voiceover یا مدل انتخابی تغییر نمی‌کند.
- فایل‌های auto-generated مثل `src/integrations/supabase/types.ts` دستکاری نمی‌شوند.