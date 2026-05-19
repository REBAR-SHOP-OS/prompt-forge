## مشکل

تمام کارت‌های ۴۵ ثانیه‌ای روی ۹۵٪ گیر می‌کنند چون Veo extension call با خطای ۴۰۰ شکست می‌خورد و پروسه‌ی fail-job هم به‌درستی نهایی نمی‌شود.

از لاگ‌های `jobs-get` (تاریخ ۱۹ می، چند بار تکرار):
```
veo extend failed status:400
"`bytesBase64Encoded` isn't supported by this model"
"`mimeType` isn't supported by this model"
```

علت اصلی در `supabase/functions/_shared/modules/external-api-adapter/service.ts` تابع `startVeoExtension` (خطوط ۵۴۲–۵۷۹): شکل request اشتباه است.

شکل فعلی (غلط):
```json
{"instances":[{"prompt":"...","video":{"bytesBase64Encoded":"...","mimeType":"video/mp4"}}],
 "parameters":{"aspectRatio":"...","resolution":"720p","sampleCount":1}}
```

شکل صحیح طبق Gemini REST docs:
```json
{"instances":[{"prompt":"...","video":{"inlineData":{"mimeType":"video/mp4","data":"<base64>"}}}],
 "parameters":{"numberOfVideos":1,"resolution":"720p"}}
```

و یک باگ ثانویه: وقتی extension شکست می‌خورد، `pollVeo` → `failed` برمی‌گردد و gateway `failJob` را صدا می‌زند؛ اگر این RPC به هر دلیل throw کند، outer-catch فقط لاگ می‌گیرد و درصد تخمینی (که در پنجره breathe ۹۲–۹۵٪ گیر کرده) را برمی‌گرداند → کارت تا ابد روی ۹۵٪ می‌ماند و در poll بعدی دوباره همان مسیر extension تکرار می‌شود.

## تغییرات

### 1) `supabase/functions/_shared/modules/external-api-adapter/service.ts`

**`startVeoExtension` (خطوط ۵۴۲–۵۷۹):**
- body به فرمت صحیح REST تبدیل شود:
  - `instances[0].video = { inlineData: { mimeType: "video/mp4", data: bytesToBase64(videoBytes) } }`
  - `parameters = { numberOfVideos: 1, resolution: "720p" }` (بدون `aspectRatio` و `sampleCount`؛ طبق docs، extension خودش aspect-ratio کلیپ منبع را حفظ می‌کند و فقط ۷۲۰p مجاز است).
- بقیه‌ی منطق (parse `name`, error handling) دست‌نخورده.

**`VEO_EXTENDED_DURATION_SECONDS` (خط ۳۳۴):**
- مقدار را به `16` تغییر می‌دهیم (۸ ثانیه base + ۸ ثانیه extension واقعی Veo؛ مقدار فعلی ۱۵ صرفاً تخمینی بود و در صحنه‌بندی ۱۵ثانیه‌ای کاربر معنی‌دار است). هم‌چنین `state.targetDuration = 16` در `startVeo` تنظیم می‌شود تا duration نهایی بازگشت‌داده‌شده درست باشد.

**`pollVeo` (مسیر شکست extension، خطوط ۷۴۴–۷۵۵):**
- پیام `reason` خواناتر شود (مثلاً `Veo could not extend clip: <upstream message>`) — تغییر عملکردی نیست، فقط برای کاربر مفید است.

### 2) `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`

**case `getJob` (خطوط ۱۴۴–۱۵۲ و ۱۶۷–۱۷۱):**
- وقتی `poll.status === "failed"`:
  - اگر `failJob` throw کرد، در همان catch داخلی، detail را با وضعیت ساختگی `failed` به فرانت برگردانیم (به جای نشان دادن درصد تخمینی برای job که در provider قطعی failed است). به‌صورت ساده: متغیر `terminalFailedReason: string | null` نگه داریم، در catch تنظیم کنیم، و در response خروجی `status` را override کنیم به `"failed"` و `progress_percent: null`.
- این تضمین می‌کند هر job که provider قطعاً failed برگردانده، حتی اگر persist شکست بخورد، روی فرانت دیگر گیر نکند.

### 3) Out of scope

- بدون تغییر در `ScenarioWriterDialog.tsx`، `DashboardPage.tsx` و منطق تقسیم ۳ صحنه.
- بدون تغییر در Wan adapter یا سایر provider‌ها.
- بدون migration یا تغییر schema.
- بدون تغییر در `getJobProgressPercent` فرانت (95٪ breathe برای job‌های واقعاً در حال پردازش مفید است).

## Verification

- پس از deploy تابع `jobs-get`:
  - صبر می‌کنیم تا polling فعلی ۳ کارت موجود اجرا شود؛ طبق fix دوم، آن‌ها به `failed` تبدیل و credit refund می‌شوند (پیام «Video provider could not extend clip» در کارت).
  - ساخت یک سناریوی جدید ۴۵s → ۳ کارت ۱۵s. هر کارت باید phase 1 (≈۶۰–۹۰s) → phase 2 extension (≈۶۰–۹۰s) → ۱۰۰٪ و نمایش ویدیوی نهایی ≈۱۶s.
- بررسی لاگ `jobs-get` با search="veo extend"؛ نباید پیام «isn't supported by this model» تکرار شود.
- در صورت موفقیت phase 2، لاگ «veo upload failed» نباید بیاید و کارت به `completed` می‌رود.
- duration نهایی ویدئوها در ستون Pending باید ≈۱۶s باشد (نه ۸s).
