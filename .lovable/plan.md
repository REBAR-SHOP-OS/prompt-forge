# برنامه: Send all → پر کردن composer، Generate → ساخت ترتیبی ۳ کارت

## رفتار هدف

### الف) Send all to Pending
به جای ساخت مستقیم کارت‌ها:
1. **textarea «What do you want to forge?»** با این فرمت پر شود:
   ```
   === Scene 1 ===
   <متن سکانس ۱>

   === Scene 2 ===
   <متن سکانس ۲>

   === Scene 3 ===
   <متن سکانس ۳>
   ```
2. تصویر مرجع (اگر کاربر در Scenario Writer آپلود کرده) به **Start frame** کامپوزر بچسبد و `generationMode = 'image-to-video'` شود.
3. هیچ کارتی فوراً ساخته نشود؛ دیالوگ بسته شود.
4. دکمهٔ ارسال (آیکن →) فعال شود تا کاربر خودش Generate بزند.

### ب) Generate (وقتی متن شامل تگ‌های `=== Scene N ===` است)
هنگام کلیک روی ارسال:
1. اگر `promptText` با الگوی scene-tag شروع می‌شود → آن را به ۳ سکانس parse کن.
2. **Card 1** ساخته شود: prompt = Scene 1، Start frame = همان تصویری که در composer هست (اگر بود).
3. composer پاک شود (textarea و Start frame).
4. منتظر بمان تا Card 1 به status `completed` برسد و `video.storage_path` داشته باشد.
5. آخرین فریم Card 1 را capture و در bucket `wan-frames` آپلود کن → URL.
6. **Card 2** ساخته شود: prompt = Scene 2، Start = URL مرحلهٔ ۵.
7. منتظر بمان تا Card 2 کامل شود → آخرین فریم → URL.
8. **Card 3** ساخته شود: prompt = Scene 3، Start = URL مرحلهٔ ۷.
9. اگر هر سکانسی fail کرد → خطا در `videoColumnMessage` و توقف زنجیره.

## تغییرات کد

### `src/modules/generator-ui/pages/DashboardPage.tsx`

**۱) handler `onSendScenes` (حدود خط ۳۳۹۵):**
- حذف `await submitScenesAsJobs(...)`.
- تولید متن با تگ:
  ```ts
  const tagged = scenes
    .map((s, i) => `=== Scene ${i + 1} ===\n${s.trim()}`)
    .join('\n\n')
  setPromptText(tagged)
  ```
- اگر `imageUrl` بود:
  ```ts
  setGenerationMode('image-to-video')
  setUploadTarget('Start')
  setUploadedFiles([{ id: Date.now(), name: 'scenario-reference.png', size: 0,
    target: 'Start', type: 'image/png', status: 'ready', url: imageUrl, error: null }])
  ```

**۲) helper جدید `parseScenarioScenes(text: string): string[] | null`:**
- اگر `/===\s*Scene\s+\d+\s*===/i` در متن نباشد → `null`.
- در غیر این صورت بر اساس همین regex split کن، blocks خالی را drop کن، trim کن، آرایه‌ای از سکانس‌ها برگردان (حداقل ۱ تا).

**۳) Generate flow (در همان جایی که `handleSubmit` یا معادل آن `createJob` را صدا می‌زند — قبل از ساخت job):**
- `const parsed = parseScenarioScenes(promptText)`.
- اگر `parsed && parsed.length >= 2`:
  - تصویر Start فعلی (اگر بود) را به عنوان `firstSceneImageUrl` نگه دار.
  - `setPromptText('')` و `setUploadedFiles([])` و reset حالت‌های مرتبط.
  - فراخوانی `submitScenesAsJobs(parsed, firstSceneImageUrl)` — همان تابع موجود (که از قبل continuity دارد).
  - return تا flow استاندارد single-job اجرا نشود.
- اگر `parsed === null` یا فقط ۱ سکانس → flow معمولی فعلی اجرا شود.

**۴) `submitScenesAsJobs`:** بدون تغییر — منطق continuity (await آخرین فریم قبلی) از قبل پیاده شده.

**۵) محدودیت text-to-video برای 45s:** چون حالا Scene 1 از یک Start frame استفاده می‌کند، چک قدیمی `isTextToVideo` در `submitScenesAsJobs` از قبل برداشته شده — بنابراین OK. مطمئن شو در flow Generate وقتی image-to-video است هم انتخاب مدل معتبر اجازه ادامه بدهد.

## خارج از محدوده
- بدون تغییر backend / SQL / edge function.
- بدون تغییر در `regenerateCard` و `editAndReuseJob`.
- UI کارت‌ها بدون تغییر؛ هر کارت `input_prompt` همان سکانس را نشان می‌دهد.

## تست دستی
1. Scenario Writer → 45s → idea + image → Generate → Send all to Pending.
2. دیالوگ بسته شود؛ composer textarea پر باشد با `=== Scene 1 ===` تا `=== Scene 3 ===` و تصویر در Start.
3. کاربر Generate (دکمه ←) را بزند.
4. composer پاک شود؛ Card 1 (Scene 1) با Start = تصویر آپلودی، در Pending ظاهر شود.
5. وقتی Card 1 کامل شد، Card 2 (Scene 2) خودکار با Start = آخرین فریم Card 1 ظاهر شود.
6. وقتی Card 2 کامل شد، Card 3 (Scene 3) با Start = آخرین فریم Card 2 ظاهر شود.
7. کلیک روی هر کارت → prompt همان سکانس مربوطه است.
