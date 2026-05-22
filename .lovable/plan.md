## ریشهٔ مشکل
پیام `Could not load source video for merge ... (Merge failed)` در `DashboardPage.tsx` خط ۳۷۷۸ فقط زمانی نمایش داده می‌شود که شیء throw شده از نوع `Error` نباشد (fallback به رشتهٔ ثابت).

تنها نقطه‌ای در کل زنجیرهٔ Final Film که می‌تواند مقدار غیر-Error throw کند، `ensureMp4` در `src/modules/generator-ui/lib/transcodeToMp4.ts` است. دلایل محتمل:

1. `ffmpeg.wasm` core را از `unpkg.com` بارگذاری می‌کند؛ هر افت CDN/شبکه/CSP باعث reject با شیء داخلی Emscripten می‌شود.
2. در حالت تک‌ریسمانه، transcode فیلم‌های طولانی به Abort/OOM می‌خورد و رشتهٔ `Aborted()` یا یک عدد throw می‌شود.
3. چون `pickMimeType()` همیشه WebM انتخاب می‌کند، **هر** Final Film مجبور است از این مسیر عبور کند — پس هر شکست transcode کل پروژه را با همین پیام مبهم نابود می‌کند.

## تغییرات

### 1. شفاف‌سازی خطا — `transcodeToMp4.ts`
- helper `stringifyAny(e)`: Error → message؛ string/number → String(e)؛ سایر → JSON.stringify ایمن با fallback.
- هر مرحله (`getFFmpeg/load`, `writeFile`, `exec`, `readFile`, `deleteFile`) داخل try/catch مجزا با rethrow:
  `throw new Error('ffmpeg <stage> failed: ' + stringifyAny(e))`.
- تایم‌اوت ۳۰s روی `ff.load()` با پیام صریح.

### 2. مقاوم‌سازی CDN — `transcodeToMp4.ts`
- در `getFFmpeg()` ابتدا `unpkg.com/@ffmpeg/core@0.12.6/dist/umd` تست شود؛ اگر `load` شکست خورد، خودکار `cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd` امتحان شود.
- اگر هر دو شکست خوردند، خطای انسانی واضح: «FFmpeg core could not be loaded from any CDN».

### 3. Fallback ایمن وقتی transcode شکست خورد — `mergeVideos.ts`
- فیلد اختیاری `degraded?: boolean` به `MergeResult`.
- فراخوانی `ensureMp4` (خط ۷۹۵–۷۹۷) در try/catch:
  - موفق → همان MP4 برگردانده شود.
  - خطا → `console.warn` با جزئیات + بازگشت `{ blob: webmBlob, mimeType: chosenMime, extension: 'webm', degraded: true }`.

### 4. هندل degraded و catch بهتر — `DashboardPage.tsx`
- بلاک catch خط ۳۷۷۷ تا ۳۷۸۵:
  - `console.error('[merge] failed', err, { type: typeof err, keys: ... })`.
  - استفاده از همان `stringifyAny` به‌جای fallback ثابت — دیگر هرگز پیام «Merge failed» مبهم تولید نمی‌شود.
- پس از `mergeVideoUrls` اگر `mergeRes.degraded === true`:
  - upload با extension `.webm` (الان از `mergeRes.extension` می‌آید — خودکار درست می‌شود).
  - پس از موفقیت، یک نوتیس فارسی روی `setVideoColumnMessage`:
    «فایل نهایی به‌جای MP4 به‌صورت WebM ذخیره شد چون تبدیل MP4 در مرورگر شکست خورد (احتمالاً به دلیل حجم). فایل در پلیرهای مدرن قابل پخش است.»
  - بقیهٔ مسیر (افزودن به Library، بستن drafts، Start Over) دست‌نخورده.
- (اختیاری) فراخوانی `preloadMp4Transcoder()` در شروع merge تا اگر CDN خراب بود، شکست زودتر تشخیص داده شود.

## فایل‌های تغییریافته
- `src/modules/generator-ui/lib/transcodeToMp4.ts`
- `src/modules/generator-ui/lib/mergeVideos.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx`

## بدون تأثیر روی
- بک‌اند، schema، Edge Functionها، storage bucket یا RLS.
- منطق snapshot منابع، draft/library، Start Over.

## نتیجه برای کاربر
- در حالت عادی: همچنان MP4 با کیفیت کامل (هدف اصلی حفظ می‌شود).
- در صورت خرابی CDN یا OOM: پیام دقیق + فایل WebM قابل پخش به‌جای از دست رفتن کل کار.
- در هر شکست دیگر: پیام انسانی واقعی به‌جای «Merge failed» مبهم.
