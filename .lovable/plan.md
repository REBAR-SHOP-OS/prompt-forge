
## مشکل ریشه‌ای

دکمه‌ی Video-to-Video فعلی همه‌ی کار را داخل مرورگر با `ffmpeg.wasm` انجام می‌دهد (extract → AI per-frame → encode). همین چیزی است که خطای `ArrayBuffer at index 0 is already detached` و `memory access out of bounds` را می‌سازد — هیپ ۲ گیگی WASM با ویدیوی عمودی ۸ ثانیه‌ای پر می‌شود و حتی با ایزوله‌کردن worker و سه بار retry با کاهش رزولوشن، پایدار نیست.

این یعنی هیچ مقدار «بهینه‌سازی ffmpeg در مرورگر» مسیر را پایدار نمی‌کند. باید کل پردازش از مرورگر برداشته شود.

## رویکرد

V2V را به مسیر موجود Veo روی بک‌اند منتقل می‌کنیم (همان مسیری که Image-to-Video فعلی استفاده می‌کند، با `predictLongRunning` و polling). Veo Developer API امروز یک endpoint ناب «ویدیوی موجود را با prompt ویرایش کن» ندارد — `videos.edit` فقط برای ادامه‌دادن خودِ ویدیوهای Veo است. راه عملی و پایدار با ابزارهای موجود:

1. روی بک‌اند، فریم اول ویدیوی ورودی استخراج می‌شود (با `Mediabunny` یا `ffmpeg` در یک edge function؛ بدون درگیر کردن مرورگر کاربر).
2. آن فریم به عنوان `image` (start frame) به Veo 3.1 image-to-video داده می‌شود همراه با prompt کاربر که صریحاً می‌گوید «این صحنه را با همین کادربندی و حرکت دوربین حفظ کن، فقط X را تغییر بده».
3. خروجی Veo (همان مسیر آپلود به bucket `merged-videos`) برمی‌گردد و در همان کارت Pending کاربر جایگزین می‌شود — دقیقاً مثل بقیه‌ی نتایج Veo.

این روش:
- خطای out-of-memory مرورگر را کاملاً حذف می‌کند.
- ساختار / کادربندی / موضوع را به‌خوبی حفظ می‌کند چون Veo از همان فریم اول شروع می‌کند.
- از همان `GEMINI_API_KEY` و همان pipeline موجود job-orchestrator استفاده می‌کند (نه provider جدید، نه secret جدید).

محدودیت‌هایی که صادقانه به کاربر اعلام می‌شود: ویدیوی خروجی دقیقاً frame-by-frame همان ورودی نیست (Veo کلیپ تازه می‌سازد)، طولش روی ۸ ثانیه قفل می‌شود، و حرکت دوربین ممکن است کمی تغییر کند. این صادقانه‌ترین چیزی است که با Veo فعلی می‌شود ساخت و هزاران برابر پایدارتر از مسیر ffmpeg-in-browser فعلی است.

## تغییرات

### بک‌اند

- **edge function جدید `video-edit-start`**:
  - ورودی: `{ sourceVideoUrl, prompt, aspectRatio? }`
  - فریم اول را با ffmpeg (یا fetch range + Mediabunny روی Deno) استخراج می‌کند، به storage آپلود می‌کند، URL را به عنوان `firstFrameUrl` می‌دهد به همان `startGeneration` در `external-api-adapter/service.ts` با `providerKey='flow'` و `modelKey='veo-3.1-generate-preview'`.
  - prompt را به این صورت می‌سازد: `${userPrompt}. Keep the exact same composition, camera angle, framing, subject identity, lighting and motion as the reference frame. Only change what was requested.`
  - یک job استاندارد generator می‌سازد (همان `generator_start_job` + `generator_mark_job_processing`) تا کارت‌Pending و polling فعلی همان‌طور کار کند.
- یک ثابت قیمت‌گذاری (هر job V2V = همان هزینه‌ی یک Veo image-to-video 8s).
- اگر استخراج فریم اول روی Deno سخت بود، fallback: از `video.currentTime=0` در مرورگر یک snapshot canvas گرفته و به عنوان `firstFrameDataUrl` به edge function فرستاده می‌شود (سبک، چند ده کیلوبایت، هیچ ربطی به ffmpeg ندارد). این مسیر را به‌عنوان روش اصلی می‌گیریم چون پیاده‌سازی‌اش ساده و قطعی است.

### فرانت

- `editVideoWithAi.ts` و کل وابستگی به `ffmpeg.wasm` در `VideoToVideoDialog` حذف.
- `VideoToVideoDialog` بازنویسی می‌شود:
  - یک `<video>` مخفی + `<canvas>` می‌سازد، روی فریم اول snapshot می‌گیرد (`toDataURL('image/jpeg', 0.92)`).
  - `supabase.functions.invoke('video-edit-start', { body: { firstFrameDataUrl, prompt, aspectRatio } })` صدا می‌زند و `jobId` می‌گیرد.
  - دیالوگ بسته می‌شود؛ کاربر همان کارت Pending خودش را می‌بیند که با polling عادی نتیجه‌ی Veo را نشان می‌دهد — دقیقاً مثل وقتی Image-to-Video جدید می‌زند.
- پیام راهنما در دیالوگ به‌روزرسانی می‌شود: «این ابزار با Veo 3.1 یک کلیپ ۸ ثانیه‌ای می‌سازد که کادر و موضوع ویدیوی شما را حفظ می‌کند و فقط چیزی که می‌نویسید را تغییر می‌دهد.»

### پاک‌سازی

- حذف `src/modules/generator-ui/lib/editVideoWithAi.ts`.
- حذف `createIsolatedFFmpeg` و `stringifyAny` export از `transcodeToMp4.ts` اگر جای دیگری استفاده نمی‌شود (می‌مانند اگر استفاده می‌شوند — چک می‌کنم).
- `.lovable/plan.md` به‌روزرسانی.

## فایل‌های اثرگذار

- `supabase/functions/video-edit-start/index.ts` (جدید)
- `supabase/config.toml` (ثبت function جدید با `verify_jwt = true`)
- `src/modules/generator-ui/components/VideoToVideoDialog.tsx` (بازنویسی)
- `src/modules/generator-ui/lib/editVideoWithAi.ts` (حذف)
- `src/modules/generator-ui/lib/transcodeToMp4.ts` (حذف export های بلااستفاده)

## تست

1. باز کردن یک کلیپ Pending → دکمه‌ی ✨ → نوشتن «ماشین آبی شود» → Apply.
2. دیالوگ سریع بسته می‌شود، کارت Pending جدید با وضعیت Processing ظاهر می‌شود.
3. ~۶۰–۱۲۰ ثانیه بعد، ویدیوی ویرایش‌شده‌ی Veo در همان کارت نمایش داده می‌شود.
4. دیگر هیچ خطای `ArrayBuffer detached` یا `memory access out of bounds` در console نباشد.
5. تست خرابی: prompt خالی → پیام validation؛ ویدیوی خیلی بزرگ → snapshot فریم اول هنوز کار می‌کند چون فقط یک فریم می‌گیریم.
