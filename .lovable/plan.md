## افزودن گزینه‌ی ۱۳۵ ثانیه

یک گزینه‌ی جدید `135s` کنار `5s / 10s / 15s / 45s` در نوار انتخاب مدت‌زمان اضافه می‌شود. منطقش دقیقاً مثل ۴۵ ثانیه است، اما به جای ۳ سکانس ۱۵ ثانیه‌ای، **۹ سکانس ۱۵ ثانیه‌ای** ساخته می‌شود (۹ × ۱۵ = ۱۳۵).

### رفتار کاربر
- کاربر روی `135s` می‌زند، پرامتش را می‌نویسد، Generate.
- پرامت از طریق edge function `scenario-write` به ۹ سکانس پیوسته‌ی ۱۵ ثانیه‌ای شکسته می‌شود.
- هر سکانس یک کارت جداگانه در Pending می‌سازد و با چینینگ فریم (last frame → first frame) به هم متصل می‌شوند، دقیقاً مثل ۴۵ ثانیه.
- در Final Film این ۹ کلیپ به ترتیب merge می‌شوند.
- اگر `scenario-write` خطا بدهد یا کمتر از ۲ سکانس برگرداند، fallback اجرا می‌شود: ۹ کلیپ با همان پرامت تکراری (مثل رفتار فعلی fallback برای ۴۵s).

### تغییرات کد

**۱. `src/modules/generator-ui/pages/DashboardPage.tsx`**
- خط ۴۸۲: `useState<5 | 10 | 15 | 45>` → `useState<5 | 10 | 15 | 45 | 135>`
- خط ۴۸۰۴: آرایه‌ی تب‌ها → `[5, 10, 15, 45, 135] as const`
- خط ۲۱۹۳ به بعد: شرط `durationSeconds === 45` به `durationSeconds === 45 || durationSeconds === 135` تعمیم پیدا می‌کند. مقدار `durationSeconds` ارسالی به edge function همان عدد انتخاب‌شده می‌شود.
- خط ۲۲۲۶ (legacy fallback): `iterations = durationSeconds === 135 ? 9 : durationSeconds === 45 ? 3 : 1`، `perClipDuration = (durationSeconds === 45 || durationSeconds === 135) ? 15 : durationSeconds`.
- خط ۳۶۳۱ (`ClipTrimmerDialog defaultDuration`): اگر ۱۳۵ بود همان ۱۳۵ پاس بده، در غیر این صورت همان منطق قبلی.

**۲. `supabase/functions/scenario-write/index.ts`**
- `WORD_CAPS`: کلید `135: 810` اضافه شود (۹ × ۹۰).
- `BEAT_GUIDE`: کلید `135: "135s = nine sequential 15s scenes"` اضافه شود.
- `buildSystemPrompt`: شاخه‌ی فعلیِ `duration === 45` به شکل عمومی برای «N سکانس ۱۵ ثانیه‌ای» بازنویسی شود؛ برای ۱۳۵ تعداد سکانس‌ها ۹ و برای ۴۵ همان ۳، با همان delimiter `===SCENE===`.
- `parseScenes`: به جای hard-code کردن عدد ۳، تعداد مورد انتظار را از روی `duration` محاسبه کند (`expected = duration === 135 ? 9 : duration === 45 ? 3 : 1`) و دقیقاً همان تعداد را برگرداند؛ در غیر این صورت fallback به paragraph split با همان شمارش.
- اعتبارسنجی ورودی: `[5, 10, 15, 45, 135].includes(durationRaw)`.
- منطق retry و fallback نهایی (single block) همان مسیر فعلی، فقط برای ۱۳۵ هم فعال.

### بدون تغییر
- جدول‌ها، RLS، اعتبارات (هر کلیپ همان هزینه‌ی فعلی ۱۵s را دارد — یعنی ۱۳۵s در عمل ۹ برابر هزینه‌ی یک کلیپ ۱۵s است؛ همین رفتار فعلیِ ۴۵s × ۳ است).
- Final Film, Library, کارت‌های عکس، voiceover، music.
- `submitScenesAsJobs` (از قبل برای هر تعداد سکانس کار می‌کند).

### هزینه / ریسک
- ۱۳۵ ثانیه = ۹ کلیپ موازی/سری از Veo که هزینه‌ی اعتبار و زمان رندر بالایی دارد. اعتبارسنجی موجود در backend (rate limit + credit check در `generator_start_job`) خودش جلوی اضافه‌برداشت را می‌گیرد.
- اگر مدل AI نتواند دقیقاً ۹ سکانس برگرداند، یک retry می‌خورد، سپس به fallback «۹ کلیپ با همان پرامت» می‌افتد — بدون شکست UI.