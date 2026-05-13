## هدف
افزودن دکمهٔ **Regenerate** (ری‌جنریت) به هر کارت کلیپ. با کلیک روی آن:
1. ویدیوی فعلی همان کارت پاک می‌شود (هم در سرور و هم در UI)
2. یک job جدید با همان پرامت، همان provider/model، همان فریم‌های Start/End، همان aspect ratio و همان duration ساخته می‌شود
3. کارت جدید به‌جای کارت قدیمی در همان موقعیت ظاهر می‌شود و progress آن polling می‌شود

## تغییرات (فقط فرانت‌اند)
فایل: `src/modules/generator-ui/pages/DashboardPage.tsx`

### 1) تابع جدید `regenerateJob(job: JobDetail)`
- در ابتدا با `window.confirm('Replace this clip with a new render from the same prompt?')` تأیید می‌گیرد.
- پارامترهای ورودی برای ساخت job جدید:
  - `prompt = job.input_prompt`
  - `providerKey = (job.provider_key as 'wan'|'flow') ?? 'wan'`
  - `requestedModel = job.model_key ?? undefined`
  - `firstFrameUrl = job.first_frame_url ?? undefined`
  - `lastFrameUrl = job.last_frame_url ?? undefined`
  - `aspectRatio = clipRatios[job.id] ?? lockedProjectRatio ?? aspectRatio` (همان نسبت تصویری ثبت‌شدهٔ کارت قدیمی)
  - `durationSeconds = durationSeconds` (ثابت در سطح کامپوزر)
- اگر هیچ فریمی نبود و provider/model پشتیبان t2v بود → text-to-video، در غیر این صورت i2v.
- مراحل:
  1. `await videoLibraryGateway.deleteJob(job.id)` (یا فراخوانی همان مسیری که `deleteCard` استفاده می‌کند)؛ سپس از `generatedVideos` و `projectSourceJobs` و `approvedIds` حذف می‌شود (همان منطق `deleteCard` ولی بدون confirm جدا).
  2. `jobOrchestratorGateway.createJob({...})` فراخوانی می‌شود.
  3. job جدید با `buildSeededJob` به ابتدای لیست افزوده می‌شود — یا اگر بخواهیم در همان موقعیت قبلی قرار گیرد، index کارت قدیمی را قبل از حذف ذخیره و job جدید را در همان index درج می‌کنیم.
  4. `rememberClipRatio(newJob.id, effectiveRatio)` صدا زده می‌شود.
  5. polling فعلی (`pollFailureCountRef`/`Promise.allSettled`) خودکار آن را پوشش می‌دهد.
- خطاها در `composerError`/`videoColumnMessage` نمایش داده می‌شوند.

### 2) UI — دکمهٔ Regenerate در هر کارت
دو مکانی که اکشن‌های کارت قرار دارند (خطوط ~۳۴۷۲ و ~۳۷۲۶) به‌روزرسانی می‌شود: یک دکمهٔ گرد جدید با آیکون `RotateCcw` (که از قبل در imports هست)، بین «Edit» و «Trim»، با کلاس‌های مشابه باقی دکمه‌ها (hover به رنگ amber/sky)، `aria-label="Regenerate clip"` و `title="Regenerate from same prompt"`.
دکمه فقط وقتی نمایش داده می‌شود که job دارای `input_prompt` باشد و `status` در حالت `processing` نباشد (در حین رندر، غیرفعال یا مخفی).

### 3) خارج از محدوده
- بک‌اند، edge functions و contractها تغییری نمی‌کنند.
- منطق `editAndReuseJob` (Pencil) دست‌نخورده می‌ماند — Regenerate یک مسیر مستقل و سریع است.

## تأیید
- کلیک روی Regenerate یک کارت کامل شده → confirm → کارت قدیمی محو، کارت جدید ظاهر می‌شود و progress آن می‌چرخد.
- پس از اتمام، کلیپ جدید با همان aspect ratio و همان provider/model نمایش داده می‌شود.
- Final Film و Library به‌درستی به کلیپ جدید رفرنس می‌دهند (چون id جدید است؛ کلیپ قدیمی از همه‌جا پاک شده).
