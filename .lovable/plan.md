# برنامه: هر سکانس → یک کارت Pending مستقل با continuity

## رفتار هدف
وقتی کاربر در Scenario Writer (45s) روی **Send all to Pending** می‌زند:
1. composer (chat box) و uploadedFiles **خالی** می‌مانند — هیچ متن یا تصویری در ورودی اصلی نمی‌نشیند.
2. سه کارت Pending جدا، به ترتیب، ساخته می‌شوند:
   - **Card 1**: prompt = Scene 1، Start frame = تصویر آپلودشده در دیالوگ (اگر نبود → text-to-video).
   - **Card 2**: prompt = Scene 2، Start frame = آخرین فریم Card 1 (بعد از کامل شدن آن).
   - **Card 3**: prompt = Scene 3، Start frame = آخرین فریم Card 2 (بعد از کامل شدن آن).
3. هر کارت در UI همان سکانس خودش را به عنوان prompt نشان می‌دهد.

## تغییرات کد

### `src/modules/generator-ui/components/ScenarioWriterDialog.tsx`
بدون تغییر منطقی؛ همان `onSendScenes(scenes, imageUrl)` فعلی استفاده می‌شود.

### `src/modules/generator-ui/pages/DashboardPage.tsx`

**۱) handler `onSendScenes` (حدود خط 3353):** پاک کردن همهٔ `setPromptText` / `setUploadedFiles` / `setGenerationMode` — فقط `await submitScenesAsJobs(scenes, imageUrl)` صدا زده شود. composer دست‌نخورده می‌ماند.

**۲) `submitScenesAsJobs` (خط 2129) را بازنویسی کن:**

امضای جدید: `submitScenesAsJobs(scenes: string[], firstSceneImageUrl?: string)`.

برای هر سکانس به ترتیب:
- `prompt = scene.trim()`؛ خالی را skip کن.
- `startFrameUrl` را تعیین کن:
  - سکانس اول: `firstSceneImageUrl ?? undefined`.
  - سکانس‌های بعدی: `await waitForLastFrameOf(previousJobId)` (پایین توضیح).
- اگر `startFrameUrl` موجود است → `generationMode` معادل image-to-video برای این کارت؛ `createJob({ ..., firstFrameUrl: startFrameUrl })` و `buildSeededJob(prompt, createdJob, { firstFrameUrl: startFrameUrl })`.
- اگر نه → text-to-video.
- `mergeJob` → setPreviewVideoId → markActiveJob → `previousJobId = seededJob.id`.
- بین کارت‌ها از خود `composer` چیزی set نشود.

در `finally`: `setIsSubmitting(false)`. **هیچ** `setPromptText('')` و `setUploadedFiles([])` نباشد چون اصلاً آلوده‌اش نکردیم.

**۳) helper جدید `waitForLastFrameOf(prevJobId: string): Promise<string | undefined>`:**
- polling روی `generatedVideos` (یا مستقیم `jobOrchestratorGateway.getJob(prevJobId)`) با interval ~3s و timeout ~10 دقیقه.
- وقتی `normalizeStatus(job.status) === 'completed'` و `job.video?.storage_path` موجود است:
  - `proxied = await proxiedVideoUrl(storage_path)`
  - `blob = await captureLastFrameAsBlob(proxied)`
  - آپلود در bucket `wan-frames` با مسیر `${userId}/scene-chain-${Date.now()}-${uuid}.png`
  - `return publicUrl`.
- اگر job fail شد → `throw new Error('Previous scene failed; cannot chain')` که در try/catch بالا گرفته شود و در `setVideoColumnMessage` نمایش داده شود؛ بقیهٔ سکانس‌ها ساخته نشوند.
- اگر timeout شد → همان پیام خطا.

**۴) UI feedback:** در طول `waitForLastFrameOf` یک پیام کوتاه در `setVideoColumnMessage` مثل «Waiting for Scene N to finish before queuing Scene N+1…» ست شود و بعد پاک شود.

## خارج از محدوده
- بدون تغییر backend / SQL / edge function.
- بدون تغییر در `regenerateCard` یا `editAndReuseJob`.
- بدون تغییر در UI کارت — کارت‌ها همان‌طور که الان prompt را نشان می‌دهند، خودبه‌خود سکانس مربوطهٔ خودشان را نشان خواهند داد چون `input_prompt` هر job دقیقاً همان سکانس است.

## تست دستی
1. در Scenario Writer، 45s، یک تصویر مرجع آپلود کن، Generate، سپس Send all to Pending.
2. بلافاصله سه کارت Pending با ترتیب Scene 1/2/3 ظاهر می‌شوند (Card 2 و 3 در ابتدا منتظر می‌مانند).
3. composer (textarea و آیکن آپلود) خالی باقی می‌ماند.
4. Card 1 رندر می‌شود → خودکار Card 2 با Start = آخرین فریم Card 1 آغاز می‌شود → سپس Card 3.
5. کلیک روی هر کارت، prompt آن دقیقاً متن همان سکانس را نشان می‌دهد.
