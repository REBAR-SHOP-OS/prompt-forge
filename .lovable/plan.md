## اضافه کردن پشتیبانی 30 ثانیه به scenario-write

در فرانت‌اند `DashboardPage.tsx`، حالت 30 ثانیه از قبل پیاده شده (split به 2 کلیپ 15 ثانیه‌ای، درست مشابه منطق 45s=3×15s و 135s=9×15s). اما edge function `scenario-write` فقط مقادیر `[5, 10, 15, 45, 135]` را می‌پذیرد و درخواست 30 ثانیه با خطا برمی‌گردد — همان «Error / The app encountered an error» که در اسکرین‌شات دیده می‌شود.

### تغییرات در `supabase/functions/scenario-write/index.ts`

1. اضافه کردن `30: 180` به `WORD_CAPS`.
2. اضافه کردن `30: "30s = two sequential 15s scenes"` به `BEAT_GUIDE`.
3. در `expectedSceneCount`: اگر `duration === 30` → return `2`.
4. در `buildSystemPrompt` (شاخه multi-scene): پشتیبانی numWord برای 2 (`"TWO"`).
5. در validation: تغییر لیست مجاز به `[5, 10, 15, 30, 45, 135]` و به‌روزرسانی پیام خطا.

### فایل‌ها
- فقط `supabase/functions/scenario-write/index.ts`.

### ریسک
- بدون تغییر در فرانت یا دیتابیس. فرانت‌اند از قبل آماده دریافت 2 صحنه برای 30s است.