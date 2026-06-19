## هدف نهایی
وقتی روی دانلود MP4 کلیک می‌شود، فایل واقعی `.mp4` ساخته و دانلود شود؛ اگر آماده‌سازی طولانی شد، وضعیت پایدار بماند و چرخه loading از اول تکرار نشود.

## تشخیص ریشه‌ای
- مسیر فعلی دانلود Final Video هنوز از `ensureMp4` داخل مرورگر استفاده می‌کند.
- لاگ نشان می‌دهد encode در مرورگر بعد از 150 ثانیه timeout می‌شود: `720p encode failed, retrying at 540p`.
- همین باعث می‌شود progress به 100 یا نزدیک آن برسد، دوباره retry/loading شروع شود، و در نهایت هیچ فایل MP4 دانلود نشود.
- در کد، فانکشن‌های backend برای export MP4 (`mp4-export-create`, `mp4-export-status`, `mp4-export-worker`) وجود دارند، اما UI دانلود هنوز به جای استفاده از آن‌ها، مسیر ناپایدار browser-side ffmpeg را اجرا می‌کند.

## محدودیت‌ها و چیزهایی که نباید خراب شود
- دانلود مستقیم فایل‌های MP4 موجود نباید کند یا تغییر کند.
- دانلود original / WEBM نباید تغییر کند.
- state، کارت‌ها، Draftها و UIهای غیرمرتبط دست‌نخورده بمانند.
- فایل WebM نباید با پسوند `.mp4` دانلود شود.
- خطا باید واضح نمایش داده شود و spinner/progress حتماً پاک شود.

## برنامه اجرا
1. در `DashboardPage.tsx` مسیر `downloadAsMp4` را تغییر می‌دهم تا برای WebM به جای `ensureMp4` مرورگر، backend export job را صدا بزند.
2. برای فایل‌هایی که از قبل `.mp4` هستند، همان مسیر مستقیم `downloadSigned` حفظ می‌شود.
3. برای WebM:
   - `bucket/path` منبع resolve می‌شود.
   - `mp4-export-create` فراخوانی می‌شود.
   - اگر خروجی cached یا already completed بود، همان لحظه دانلود می‌شود.
   - اگر job در حال پردازش بود، `mp4-export-status` با polling کنترل‌شده بررسی می‌شود.
   - بعد از completed، URL خروجی MP4 با `triggerDownload` دانلود می‌شود.
4. progress UI را پایدار می‌کنم: هنگام پردازش backend درصد مصنوعی تا قبل از completion بالا می‌رود، اما فقط بعد از دریافت URL نهایی 100 می‌شود.
5. fallback مرورگری `ensureMp4` را از مسیر دانلود Final Video حذف می‌کنم تا timeout مرورگر دیگر باعث تکرار loading نشود.
6. در صورت نیاز، فانکشن worker را هم بررسی/اصلاح می‌کنم تا job فقط بعد از verify شدن فایل خروجی `completed` شود.

## اعتبارسنجی
- بررسی می‌کنم که مسیر دانلود دیگر `ensureMp4` را برای Final Video WebM اجرا نکند.
- بررسی می‌کنم polling روی `completed/failed/timeout` درست متوقف شود.
- بررسی می‌کنم `finishDownloading` در همه مسیرها اجرا شود.
- در صورت امکان با preview/network تست می‌کنم که درخواست‌های `mp4-export-create` و `mp4-export-status` زده شوند و دانلود از URL نهایی انجام شود.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>