# Split 45s scenario into 3 sequential clips

وقتی duration در دیالوگ Scenario Writer روی `45s` باشد، AI خروجی را به‌جای یک متن واحد، به **سه بخش پشت‌سرهم 15 ثانیه‌ای** (Scene 1 / Scene 2 / Scene 3) تولید می‌کند. سپس با یک دکمه‌ی جدید "Send all to Pending"، هر سه بخش به‌صورت سه کارت پشت‌سرهم در ستون Pending ساخته می‌شوند — دقیقاً همان مسیر فعلی 45s (هر کارت یک کلیپ 15 ثانیه‌ای، با همان aspect ratio و مدل انتخاب‌شده در composer).

برای `5s / 10s / 15s` رفتار فعلی بدون تغییر باقی می‌ماند (یک متن روایی واحد + دکمه‌ی فعلی *Use as prompt*).

## Backend

**`supabase/functions/scenario-write/index.ts`** — به‌روزرسانی:

- وقتی `durationSeconds === 45`، system prompt تغییر می‌کند به:
  > Write a continuous narrative scenario in **English** for a 45-second cinematic video, structured as **three sequential 15-second scenes** that flow into each other. Output EXACTLY three scene blocks separated by the literal delimiter `===SCENE===` on its own line. Do not number scenes, do not add headings or labels, no markdown, no preamble. Each scene ~70–90 words, self-contained as a video prompt (include subject, action, camera move, lighting), while continuing the story from the previous scene.
- پارس خروجی: `scenario.split(/\n?===SCENE===\n?/).map(s => s.trim()).filter(Boolean)`. اگر دقیقاً 3 قطعه نشد، یک بار با همان prompt retry می‌شود؛ اگر باز هم نشد، fallback: کل متن را به سه پاراگراف بر اساس `\n\n` تقسیم می‌کنیم و اگر تعداد ≠ 3 شد، متن کامل را به‌عنوان تنها بخش برمی‌گردانیم با هشدار.
- شکل پاسخ:
  - 5/10/15: `{ scenario: string, scenes: [string] }` (بدون breaking change برای مصرف فعلی؛ `scenario` همان قبلی).
  - 45: `{ scenario: string, scenes: [string, string, string] }` که `scenario` نسخه‌ی concat با دو خط فاصله برای نمایش.

محدودیت ورودی، خطاهای 429/402/500 و بقیه‌ی منطق بدون تغییر.

## Frontend

### `src/modules/generator-ui/components/ScenarioWriterDialog.tsx`

1. `scenes: string[]` به state اضافه شود (پر می‌شود از `data.scenes`).
2. وقتی `duration === 45` و `scenes.length === 3`:
   - نمایش سه کارت scene جدا با هدر "Scene 1 (0–15s)"، "Scene 2 (15–30s)"، "Scene 3 (30–45s)" و متن هرکدام در یک `<div class="prose">` با دکمه‌ی **Copy** اختصاصی هر صحنه.
   - دکمه‌های پایین دیالوگ:
     - **Copy all** (concat با `\n\n`).
     - **Regenerate**.
     - **Send all to Pending** (primary) — دیالوگ را می‌بندد و یک callback جدید `onSendScenes(scenes: string[])` صدا می‌زند. دکمه‌ی *Use as prompt* در حالت 45s حذف می‌شود (چون textarea تنها برای یک prompt است).
3. برای 5/10/15: همان رفتار فعلی (Copy / Regenerate / Use as prompt).
4. اضافه‌کردن prop جدید: `onSendScenes?: (scenes: string[]) => void | Promise<void>` و prop فعلی `onUseAsPrompt` بدون تغییر.

### `src/modules/generator-ui/pages/DashboardPage.tsx`

1. ایجاد یک تابع جدید `submitScenesAsJobs(scenes: string[])` بالا/کنار `handleSubmit` که:
   - شرط‌های پیش‌نیاز فعلی (`canSubmit` غیر از prompt) را بررسی می‌کند: مدل انتخاب‌شده، credit، حالت Text-to-Video.
   - **محدودیت دامنه:** فقط حالت Text-to-Video را پشتیبانی می‌کند (بدون start/end frame). اگر کاربر در حالت Image-to-Video است، با toast پیام داده شود: "Scenario writer (45s) currently supports Text-to-Video only" و عملیات لغو شود.
   - `effectiveRatio = aspectRatio` و `perClipDuration = 15`.
   - برای هر صحنه (به ترتیب)، همان حلقه‌ی موجود در خطوط 2025–2090 را اجرا می‌کند (`jobOrchestratorGateway.createJob` + `buildSeededJob` + `rememberClipRatio` + lock ratio + رفرش لیست Pending)، با این تفاوت که `prompt` هر iteration متن همان scene است (نه `nextPrompt` مشترک). پس از موفقیت، textarea خالی می‌ماند و دیالوگ بسته می‌شود.
   - مدیریت خطا و state `isSubmitting` مثل `handleSubmit` فعلی.
2. به `ScenarioWriterDialog` در خطوط 3164–3167 پراپ `onSendScenes={submitScenesAsJobs}` پاس داده شود.

## Out of scope

- بدون تغییر در duration radio بیرونی composer.
- بدون پشتیبانی از Image-to-Video / start/end frames برای scenario 45s در این مرحله (فقط toast).
- بدون migration یا تغییر schema.
- بدون chaining فریم‌های انتهای هر کلیپ به ابتدای کلیپ بعدی (همان رفتار فعلی 45s باقی می‌ماند).
- بدون تغییر در سایر تنظیمات (model picker, ratio, voiceover, music).

## Verification

- باز کردن دیالوگ، انتخاب `45s`، وارد کردن ایده → خروجی به‌صورت 3 کارت scene جداگانه با هدر زمانی نمایش داده شود.
- کلیک Copy روی هر scene فقط متن همان scene را کپی کند.
- کلیک "Send all to Pending" → دیالوگ بسته شود و 3 کارت 15 ثانیه‌ای جدید با promptهای متفاوت در ستون Pending ظاهر شوند، هر کدام با همان aspect ratio انتخاب‌شده.
- در حالت 5/10/15 رفتار قبلی (Use as prompt) دست‌نخورده باشد.
- در حالت Image-to-Video با duration=45 دکمه‌ی Send، toast راهنما نشان دهد و هیچ job ساخته نشود.
- خطای 402/429 در دیالوگ به‌صورت قرمز نمایش داده شود.
