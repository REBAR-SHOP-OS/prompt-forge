## هدف نهایی
کارت‌های Pending/Library دیگر به‌صورت تصادفی با پیام `Video unavailable` نمایش داده نشوند؛ اگر ویدئو واقعاً قابل پخش است، کارت همیشه آن را با یک مسیر پایدار نمایش دهد.

## تشخیص فعلی
- مسیر نمایش کارت‌ها از `PlayableVideo` و `usePlayableVideoUrl` عبور می‌کند.
- برای آدرس‌های خود پروژه، `proxiedVideoUrl` فعلاً proxy را دور می‌زند و همان لینک مستقیم Storage را به `<video>` می‌دهد.
- در `PlayableVideo`، هر `onError` ویدئو بلافاصله کارت را برای همان mount به حالت دائمی `Video unavailable` می‌برد؛ حتی اگر خطا موقت، ناشی از seek زودهنگام، network hiccup، یا race بین src/metadata باشد.
- در screenshot، همان پروژه در preview اصلی پخش می‌شود ولی یکی از کارت‌ها unavailable است؛ یعنی داده از بین نرفته و مشکل در لایه‌ی نمایش/resolve ویدئو است، نه در پروژه یا snapshot.

## برنامه اجرا
1. **ریشه‌ای کردن resolve ویدئو**
   - `proxiedVideoUrl` را طوری تغییر می‌دهم که آدرس‌های Storage خود پروژه هم از مسیر `video-proxy` عبور کنند، نه لینک مستقیم.
   - علت: یک مسیر واحد، same-origin/CORS-safe، با Range support برای همه کارت‌ها و previewها؛ این باعث حذف رفتار دوگانه بین کارت و preview می‌شود.

2. **قوی کردن `PlayableVideo` در برابر خطای موقت**
   - با تغییر `src`، state خطا reset شود.
   - روی error یک retry محدود با cache-busting انجام شود، نه اینکه کارت فوراً دائمی unavailable شود.
   - فقط بعد از چند تلاش ناموفق، fallback نشان داده شود.
   - اگر poster وجود دارد، fallback همچنان poster را نشان دهد تا کارت سیاه/خراب دیده نشود.

3. **جلوگیری از false-error هنگام seek اولیه کارت**
   - seek روی thumbnail/card فقط بعد از `loadedmetadata` و با guard فعلی می‌ماند، اما با retry جدید خطای ناشی از seek زودهنگام دیگر کارت را دائمی خراب نمی‌کند.

4. **تست و اعتبارسنجی**
   - preview را باز می‌کنم و کارت‌های Pending را بررسی می‌کنم.
   - DOM ویدئوها را چک می‌کنم: `currentSrc`, `readyState`, `error`.
   - Network را برای `video-proxy` بررسی می‌کنم تا درخواست‌های ویدئو 200/206 باشند.
   - اگر هنوز کارت خراب بود، علت دقیق را از network/DOM جدا می‌کنم و اصلاح دوم را انجام می‌دهم.

## فایل‌های احتمالی تغییر
- `src/modules/generator-ui/lib/proxiedVideoUrl.ts`
- `src/modules/generator-ui/components/PlayableVideo.tsx`

## محدودیت‌ها و چیزهایی که نباید خراب شود
- دیتابیس، RLS، پروژه‌ها، drafts، Library و داده‌های کاربر تغییر نمی‌کند.
- فایل‌های auto-generated backend/client دست‌کاری نمی‌شوند.
- مسیر امنیتی proxy حفظ می‌شود: token کاربر همچنان لازم است و host allowlist باقی می‌ماند.
- تغییر محدود به نمایش ویدئو و پایداری کارت‌هاست.