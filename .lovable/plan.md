مشکل فعلی با رندر provider فرق دارد: درصد 20٪ مربوط به ساخت Final Film داخل مرورگر است، نه jobs-get. کد فعلی فقط بعد از پایان هر کلیپ درصد را آپدیت می‌کند؛ بنابراین اگر اولین کلیپ طولانی/کند باشد یا ویدیو در پایان event ندهد، دکمه می‌تواند برای مدت طولانی روی یک درصد ثابت مثل 20٪ بماند. همچنین Auth refresh خطا داده و اگر token هنگام merge/proxy/upload نامعتبر شود، UI پیام دقیق و retry کنترل‌شده ندارد.

برنامه اصلاح:

1. اصلاح progress واقعی Final Film در `mergeVideos.ts`
- پیشرفت را فقط بعد از پایان هر کلیپ محاسبه نکنم.
- هنگام پخش هر فریم/هر چندصد میلی‌ثانیه، progress را بر اساس `elapsedDuration + currentTime` گزارش کنم.
- برای مرحله‌های داخلی وضعیت دقیق بدهم: loading sources، recording clip N، applying transition، finalizing، uploading، saving.
- progress دیگر روی 20٪ ثابت نمی‌ماند، چون داخل همان کلیپ هم جلو می‌رود.

2. جلوگیری از hang دائمی در merger
- برای load metadata هر ویدیو timeout اضافه کنم تا اگر یک source/proxy گیر کرد، merge بی‌نهایت منتظر نماند.
- اگر `play()` رد شد یا video بدون جلو رفتن `currentTime` ماند، با خطای قابل فهم merge را fail کنم.
- cleanup کامل‌تر برای recorder، rAF، audio context و media elements اضافه کنم تا اجرای بعدی خراب نشود.

3. اصلاح UI دکمه Final Film در `DashboardPage.tsx`
- به جای نمایش فقط عدد، مرحله فعلی را هم نشان بدهم تا مشخص باشد گیر در «recording»، «uploading» یا «saving» است.
- progress مرحله‌ای را monotonic کنم ولی اجازه ندهم قبل از آپلود/ثبت نهایی به 100 برسد.
- برای upload به storage و ثبت entry، progressهای قطعی مثل 92٪ و 98٪ نمایش داده شود؛ 100٪ فقط بعد از ساخته شدن Library entry.

4. مدیریت خطای auth/proxy/upload
- قبل از شروع Final Film session را تازه‌سازی/اعتبارسنجی کنم.
- اگر refresh token یا auth خراب بود، merge شروع نشود و پیام روشن بدهد که کاربر باید دوباره وارد شود؛ نه اینکه روی درصد ثابت بماند.
- خطاهای proxy/storage با نام مرحله و پیام قابل اقدام نمایش داده شوند.

5. اعتبارسنجی
- سناریوی چند کلیپ + Final Film را با مرورگر بررسی می‌کنم.
- شبکه را چک می‌کنم که storage upload و ثبت Library بعد از merge انجام شود.
- console را چک می‌کنم که خطای merge/auth خام باقی نمانده باشد.

فایل‌های اصلی برای تغییر:
- `src/modules/generator-ui/lib/mergeVideos.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx`
- در صورت نیاز محدود: `src/modules/generator-ui/lib/proxiedVideoUrl.ts`

نتیجه مورد انتظار: Final Film دیگر روی 20٪ ثابت نمی‌ماند؛ یا درصد زنده و مرحله دقیق نشان می‌دهد، یا با خطای مشخص و قابل retry متوقف می‌شود.