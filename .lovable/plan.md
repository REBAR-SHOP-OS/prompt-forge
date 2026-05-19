# Add a "Scenario writer" AI button next to the composer

یک آیکون جدید کنار ورودی prompt اضافه می‌شود که سناریوی ویدیویی تولید می‌کند. کاربر اول مدت زمان را انتخاب می‌کند، سپس ایده‌اش را وارد می‌کند، و AI یک سناریوی روایی انگلیسی متناسب با آن مدت زمان می‌نویسد و در همان دیالوگ نمایش می‌دهد (با دکمه‌های Copy و Use as prompt).

## Backend

**New edge function `supabase/functions/scenario-write/index.ts`**

- ساختار مثل `enhance-prompt`: `authenticate(req)`، خواندن JSON بدنه، فراخوانی Lovable AI Gateway مستقیم (همان pattern fetch به `ai.gateway.lovable.dev/v1/chat/completions`).
- بدنه‌ی ورودی:
  - `idea: string` (الزامی، 1–1500 حرف)
  - `durationSeconds: 5 | 10 | 15 | 45` (الزامی)
- مدل: `google/gemini-2.5-flash`.
- System prompt (انگلیسی، خروجی همیشه انگلیسی صرف‌نظر از زبان ایده):
  > You are a professional short-form video scenario writer. Given the user's idea, write a single cohesive scenario/treatment in **English** suitable for a `{N}`-second cinematic video. Include opening visual hook, beat-by-beat action, camera/lighting cues, and ending. Match pacing realistically to the duration: 5s = 1 beat, 10s = 2 beats, 15s = 3 beats, 45s = 5–6 beats across ~3 shots. Output prose only — no markdown headings, no bullet lists, no preamble. Keep it under `{wordCap}` words.
  - wordCap: 5s→40, 10s→70, 15s→100, 45s→220.
- مدیریت 429/402/500 مثل `enhance-prompt`.
- پاسخ: `{ scenario: string }`.

(بدون migration، بدون جدول جدید، بدون secret جدید — `LOVABLE_API_KEY` از قبل موجود است.)

## Frontend

**`src/modules/generator-ui/pages/DashboardPage.tsx`**

1. آیکون جدید (Lucide `ClapperboardIcon` یا `ScrollText`) را به ردیف ابزارهای بالای textarea اضافه کن — همان stripی که دکمه‌های Crop و Sparkles (AI image) قرار دارند (لاین‌های ~4295–4315). دکمه با همان استایل (`h-8 w-8 rounded-full border border-white/10 …`)، tooltip: "Write a scenario from your idea".
2. State جدید: `isScenarioDialogOpen`, `scenarioDuration` (پیش‌فرض = `durationSeconds` فعلی، 5/10/15/45)، `scenarioIdea`, `isWritingScenario`, `scenarioResult`, `scenarioError`.
3. کلیک روی آیکون → `setIsScenarioDialogOpen(true)`. مقدار اولیه‌ی `scenarioDuration` با `durationSeconds` فعلی همگام می‌شود.

**New component `src/modules/generator-ui/components/ScenarioWriterDialog.tsx`** (مثل `AiImageDialog`):

- `<Dialog>` با عنوان "Scenario Writer".
- Step 1 — Duration: یک radio group افقی با گزینه‌های `5s / 10s / 15s / 45s` (همان استایل دکمه‌های duration در composer).
- Step 2 — Idea: یک `<Textarea>` با placeholder: "Describe your idea (any language)…".
- دکمه‌ی **Write scenario** (disabled وقتی idea خالی یا در حال loading) → فراخوانی `supabase.functions.invoke('scenario-write', { body: { idea, durationSeconds } })`.
- بعد از موفقیت: `scenarioResult` در یک `<div class="prose">` فقط‌خواندنی نمایش داده می‌شود (انگلیسی، ltr) با دکمه‌های:
  - **Copy** (کلیپ‌بورد).
  - **Use as prompt** → `setPromptText(scenarioResult)` و بستن دیالوگ.
  - **Regenerate** → فراخوانی مجدد با همان idea + duration.
- خطا (429/402/500) به‌صورت متن قرمز در دیالوگ نشان داده شود.

## Out of scope

- بدون تولید خودکار jobها؛ خروجی فقط در دیالوگ.
- بدون تغییر در composer prompt path یا duration radio بیرونی.
- بدون تغییر در migration، schema، یا دکمه‌های دیگر.
- بدون پشتیبانی از تصویر/فریم در ورودی سناریو.

## Verification

- کلیک روی آیکون → دیالوگ باز شود، duration پیش‌فرض = انتخاب فعلی composer.
- وارد کردن ایده‌ی فارسی → نتیجه‌ی انگلیسی برگشت می‌خورد، طول متن متناسب با duration.
- Copy متن را کپی می‌کند؛ Use as prompt متن را در textarea اصلی می‌گذارد و دیالوگ بسته می‌شود.
- Regenerate خروجی جدید تولید می‌کند.
- خطای 402 ("AI credits exhausted") در دیالوگ نمایش داده می‌شود.
