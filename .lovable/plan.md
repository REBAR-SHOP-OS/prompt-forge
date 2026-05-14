## نتیجه مورد انتظار
- آیکون Regenerate همیشه یک ویدیوی جدید با همان prompt کارت قبلی می‌سازد.
- کارت قبلی فقط بعد از ساخت موفق job جدید حذف/جایگزین می‌شود؛ اگر ساخت fail شود کارت قبلی از بین نمی‌رود.
- Preview دیگر خودکار آخرین ویدیوی Library یا Final Film را نشان نمی‌دهد؛ فقط کارت فعال/کارت‌های workspace فعلی را نشان می‌دهد.
- Library به عنوان آرشیو باقی می‌ماند و نباید به Preview یا History workspace نشت کند مگر وقتی کاربر صریحاً یک آیتم Library را انتخاب کند.

## ریشه‌های محتمل مشکل در کد فعلی
1. `regenerateJob` برای بعضی کارت‌ها از `model_key`/`provider_key` نامعتبر مثل `browser-canvas`, `user-upload`, `merged`, `upload` استفاده می‌کند؛ این‌ها مسیر واقعی ساخت ویدیو نیستند و createJob می‌تواند fail شود، در حالی که UI شبیه حذف کارت دیده می‌شود.
2. نسبت تصویر و duration ریجنریت از state فعلی composer گرفته می‌شود، نه از job اصلی؛ بنابراین بازسازی دقیق همان کارت نیست.
3. منطق `previewItem` وقتی `previewVideoId` پیدا نشود یا خالی شود، از `visibleVideos` استفاده می‌کند. `visibleVideos = mergedEntries + generatedVideos` است، یعنی Final Film/Library هم وارد fallback preview می‌شود؛ همین باعث نمایش ناگهانی آخرین کلیپ Library در پیش‌نمایش می‌شود.
4. ریجنریت از Library هم فعال است، در حالی که Library ممکن است شامل Final Film یا ویدیوی upload شده باشد که «با همان prompt» قابل تولید دوباره توسط provider نیست.

## برنامه اجرا
1. **قرارداد داده job را کامل‌تر کنم**
   - در contract فرانت‌اند و service backend فیلدهای `requested_duration` و `requested_aspect_ratio` را به `JobSummary/JobDetail` اضافه کنم.
   - `listMyJobs/getMyJob` این فیلدها را select کنند تا ریجنریت دقیقاً با تنظیمات کارت اصلی انجام شود.

2. **Regenerate را فقط برای کارت‌های قابل تولید فعال کنم**
   - یک helper بسازم مثل `canRegenerateJob(job)` که فقط providerهای واقعی `wan` و `flow` و modelهای مجاز را قبول کند.
   - دکمه Regenerate برای `merged-*`, `upload`, `browser-canvas`, `user-upload` و کارت‌های بدون prompt/درحال processing نمایش داده نشود.
   - در خود `regenerateJob` هم guard بگذارم تا حتی اگر handler از جای دیگری صدا زده شد، کارت حذف نشود و پیام خطای واضح بدهد.

3. **Regenerate را اتمیک و پایدار کنم**
   - ابتدا job جدید ساخته و seed شود.
   - بلافاصله کارت جدید با status pending/processing در همان جای کارت قبلی در `generatedVideos` وارد شود و `previewVideoId` روی کارت جدید تنظیم شود.
   - سپس حذف کارت قبلی به‌صورت best-effort اجرا شود.
   - اگر createJob شکست خورد، هیچ state مربوط به کارت قبلی تغییر نکند.
   - approval/library snapshot کارت قبلی به کارت جدید منتقل نشود مگر برای کارت single-clip واقعی؛ برای Library/Final Film regenerate اصلاً فعال نمی‌شود.

4. **Preview fallback را از Library جدا کنم**
   - fallback preview به جای `visibleVideos` فقط از `displayedClips` یا `generatedVideos` غیر-hidden استفاده کند.
   - اگر `previewVideoId` مربوط به Library/Final Film بود و کاربر آن را صریحاً انتخاب کرده، همان را نشان دهد؛ اما بعد از حذف/Start Over/Regenerate دیگر خودکار به آخرین Library برنگردد.
   - وقتی preview آیتم انتخاب‌شده پیدا نشود، `previewVideoId` پاک شود و اگر workspace کارت playable ندارد، empty state نشان داده شود.

5. **History/Library selection را تمیز کنم**
   - انتخاب آیتم Library فقط همان آیتم را preview کند و برای Final Film فقط در صورت وجود snapshot، History را در حالت selected project نشان دهد.
   - خروج از selected project یا Start Over نباید Preview را به آخرین Library fallback کند.

6. **اعتبارسنجی بعد از تغییرات**
   - با TypeScript/تست خودکار harness اعتبارسنجی شود.
   - مسیرهای دستی مورد انتظار: regenerate کارت Wan/Veo واقعی، regenerate روی کارت پردازشی پنهان، انتخاب Library، Start Over، حذف کارت preview شده.

## محدوده تغییرات
- تغییرات اصلی در `DashboardPage.tsx`، contract فرانت‌اند job orchestrator، و service/shared contract backend برای فیلدهای requested duration/aspect ratio.
- بدون تغییر در فایل‌های auto-generated مثل Supabase client/types.
- بدون تغییر مخرب در دیتابیس؛ ستون‌های لازم از قبل وجود دارند.