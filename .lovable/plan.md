بررسی نشان می‌دهد 95٪ از خودِ مرحله‌ی merge در مرورگر می‌آید، نه از آپلود: در `mergeVideos.ts` دقیقاً قبل از `recorder.stop()` مقدار 95٪ ارسال می‌شود و چون بعد از آن فقط وقتی `mergeVideoUrls` برگردد UI به 96٪ می‌رود، گیر کردن روی 95٪ یعنی فرآیند ضبط/نهایی‌سازی `MediaRecorder` کامل نمی‌شود یا هیچ خطای قابل‌نمایشی برنمی‌گرداند.

## طرح اصلاح قطعی

1. **محکم‌کردن lifecycle ضبط در `mergeVideos.ts`**
   - برای `MediaRecorder` رویدادهای `onstop`، `onerror` و timeout واقعی اضافه می‌کنم.
   - اگر `recorder.stop()` یا final chunk بیش از زمان مجاز طول بکشد، merge با خطای واضح متوقف می‌شود و UI دیگر بی‌نهایت روی 95٪ نمی‌ماند.
   - قبل از stop، ویدیوها/صداها pause می‌شوند و بعد از stop همه trackها، rAFها، intervalها، media elementها و `AudioContext` پاکسازی می‌شوند.

2. **حذف حالت‌های بی‌پاسخ در لود و پخش کلیپ‌ها**
   - `loadVideo`، preload metadata/canplay، seek فریم اول، music/voiceover metadata و `play()` همگی timeout و خطای قابل‌نمایش می‌گیرند.
   - اگر playhead ویدیو جلو نرود یا browser playback گیر کند، merge fail می‌شود نه اینکه روی درصد ثابت بماند.
   - `play()` rejection دیگر فقط `console.warn` نمی‌شود؛ به خطای کنترل‌شده تبدیل می‌شود.

3. **Abort و cleanup سراسری برای Final Film**
   - به `mergeVideoUrls` یک `AbortSignal`/cleanup داخلی اضافه می‌کنم تا اگر timeout یا خطا رخ داد، ضبط و منابع مرورگر قطع شوند.
   - این جلوی zombie recorder و mergeهای نیمه‌تمام بعد از تلاش‌های قبلی را می‌گیرد.

4. **اصلاح UI مرحله‌ای در `DashboardPage.tsx`**
   - علاوه بر درصد، stage داخلی مثل `Loading`, `Recording`, `Finalizing`, `Uploading`, `Saving` نگه داشته می‌شود.
   - 95٪ فقط به عنوان `Finalizing` نشان داده می‌شود و با watchdog اگر طولانی شد پیام دقیق می‌دهد.
   - در `catch/finally`، state کامل reset می‌شود تا دکمه برای تلاش بعدی قفل نماند.

5. **محکم‌کردن آپلود بعد از merge**
   - قبل از شروع Final Film نشست کاربر revalidate/refresh می‌شود.
   - آپلود فایل خروجی به storage با timeout و خطای روشن انجام می‌شود.
   - اگر upload fail شود، کاربر پیام مشخص می‌بیند و UI روی 96/99٪ هم گیر نمی‌کند.

6. **اعتبارسنجی بعد از پیاده‌سازی**
   - با سناریوی چند کلیپ + Final Film تست می‌کنم.
   - در Network باید بعد از `Finalizing` یک upload به `merged-videos` دیده شود.
   - در دیتابیس storage باید فایل `merged-*.mp4/webm` جدید ثبت شود.
   - در UI باید مسیر کامل 95 → 96 → 99 → 100 یا خطای قابل‌فهم طی شود، نه گیر کردن بی‌نهایت.

## فایل‌های هدف

- `src/modules/generator-ui/lib/mergeVideos.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx`
- در صورت نیاز فقط برای اشتراک helper کوچک: یک helper محلی در همان فایل‌ها، بدون تغییر دیتابیس.

## ریسک و کنترل

- تغییر فقط محدود به مسیر Final Film/merge است و تولید ویدیو، History و Library دست‌نخورده می‌مانند.
- هیچ migration لازم نیست.
- هدف این نیست که هر خطای browser را پنهان کنیم؛ هدف این است که merge یا کامل شود یا سریع، تمیز و قابل‌فهم fail کند.

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>