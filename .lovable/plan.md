## Goal
دکمه‌ی Final Film باید حتی با وجود فقط یک کارت (یک ویدیو یا یک تصویر) کار کند تا یوزر بتواند آن کارت را به Library منتقل کند یا روی همان یک کارت موزیک/ویس‌اور بگذارد.

## Changes (UI-only, in `src/modules/generator-ui/pages/DashboardPage.tsx`)

1. **Button disabled condition (~line 2325)** — تغییر آستانه از `< 2` به `< 1`:
   ```
   disabled={isMerging || (Math.max(completedSourceVideos.length, ...) + visibleUserImages.length) < 1}
   ```

2. **Title/aria fallback (~line 2329)** — به‌روزرسانی پیام راهنما برای حالت تک‌کارت (مثلاً «Save this clip as a Final Film»).

3. **Guard داخل `handleMergeAllVideos` (~line 1906)** — تغییر `eligibleClips.length < 2` به `< 1` و پیام به «Need at least 1 finished clip to finalize.»

4. **منطق edited-cards (~line 1903)** — شرط `editedVideoCount >= 2` به `>= 1` تغییر می‌کند تا اگر کاربر روی همان یک کارت ادیت Apply زده باشد، نسخه‌ی ادیت‌شده استفاده شود.

## Why this is safe
- `mergeVideoUrls` در `lib/mergeVideos.ts` فقط `urls.length === 0` را رد می‌کند، پس یک URL پشتیبانی می‌شود.
- ساخت آرایه‌ی transitions با `slice(0, -1)` برای یک کلیپ یک آرایه‌ی خالی می‌دهد — مشکلی ایجاد نمی‌کند.
- مسیر موزیک/ویس‌اور (`audioOpt`) مستقل از تعداد کلیپ‌هاست، پس روی همان یک کارت اعمال می‌شود.
- خروجی به همان شکل قبل به `mergedEntries` و `approvedIds` افزوده می‌شود → کارت در Library ظاهر می‌شود.
- بدون تغییر در بک‌اند، RLS، یا منطق ذخیره‌سازی Library؛ کارت‌های Library فقط با آیکون سطل آشغال حذف می‌شوند (طبق قانون قبلی).

## Out of scope
- بدون تغییر در state کارت‌های Library یا منطق پاک شدن.
- بدون تغییر در edge functions یا دیتابیس.
