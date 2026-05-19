# Add 45-second duration option

## Goal

اضافه کردن دکمه‌ی **45s** کنار 5s/10s/15s در نوار تنظیمات کلیپ. چون مدل ویدیو (Veo) در هر کلیپ حداکثر 15s را پشتیبانی می‌کند، انتخاب 45s باعث می‌شود **سه جاب 15 ثانیه‌ای پشت‌سرهم** در ستون Pending ایجاد شوند (با همان prompt و همان frame seedها). در نهایت در Final Film این سه کلیپ پشت سر هم پخش/مرج می‌شوند و نتیجه عملاً 45 ثانیه‌ای می‌شود.

## Scope (UI + frontend orchestration only)

تنها فایل `src/modules/generator-ui/pages/DashboardPage.tsx`. هیچ تغییری در backend, contract types, schema، یا provider service انجام نمی‌شود. (نوع `durationSeconds` در API همچنان `5|10|15` می‌ماند — برای 45s سه فراخوانی جداگانه با مقدار 15 ارسال می‌شود.)

## Changes

1. **State type** (line 399):
   ```ts
   const [durationSeconds, setDurationSeconds] = useState<5 | 10 | 15 | 45>(5)
   ```

2. **Duration radio group** (line 4236-4252):
   - تبدیل آرایه به `[5, 10, 15, 45] as const`.
   - دکمه‌ی 45s با همان استایل و رفتار، لیبل `45s`.

3. **Render submit handler** (لاین‌های ~2022–2095، همان بلوک `try { … createdJob = … }`):
   - اگر `durationSeconds === 45`، یک حلقه‌ی 3 باره اجرا کن:
     - برای هر iteration یک `createJob` با `durationSeconds: 15` و **همان** `prompt` + همان `firstFrameUrl`/`lastFrameUrl` ارسال کن.
     - هر job برگشتی را با `buildSeededJob` و `rememberClipRatio` و قفل‌کردن ratio و `setPendingJobs` (همان منطق فعلی) به ستون Pending اضافه کن.
   - در غیر این صورت همان مسیر فعلی (یک‌بار createJob با `durationSeconds`) اجرا شود.
   - اگر یکی از 3 فراخوانی شکست خورد، خطا را در `composerError` نشان بده و از حلقه خارج شو (jobهای موفق قبلی در Pending باقی می‌مانند).

4. **Hint/toast کوچک** زیر دکمه‌ها لازم نیست؛ تنها در `composerError` در صورت نیاز پیام: "45s renders as 3 × 15s clips".

## Out of scope

- بدون تغییر در contract/zod schema/provider service.
- بدون تغییر در منطق Final Film merge (همان pipeline فعلی sequential merge کلیپ‌های Ready را پشتیبانی می‌کند).
- بدون تغییر در آیکون Live preview یا Download dialog.
- بدون تغییر در `still_duration_seconds` تصاویر آپلودی (آن همچنان 1–15s).

## Verification

- انتخاب 45s → submit → سه کارت در ستون Pending ظاهر می‌شوند، هر کدام 15s.
- 5s/10s/15s دقیقاً مثل قبل کار می‌کنند (یک کارت).
- Live preview ستون Pending هر سه را پشت سر هم پخش می‌کند.
- Ratio lock پس از کلیپ اول روی همان اعمال می‌شود (مثل قبل).
