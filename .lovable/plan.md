## Goal
دکمه‌ی Final Film:
- چند کارت → مرج همه به یک فیلم نهایی + اعمال موزیک/ویس‌اور (اگر تنظیم شده) و ذخیره در Library.
- یک کارت → فقط موزیک/ویس‌اور را روی همان کلیپ اعمال کند و خروجی را در Library ذخیره کند.

## Current state (بررسی شده)
طبق تغییرات قبلی در `src/modules/generator-ui/pages/DashboardPage.tsx`:
- آستانه‌های `< 2` به `< 1` تغییر کرده‌اند (خط 1903 و 1908) و دکمه با ۱ کارت فعال است.
- در `mergeVideos.ts` فقط `urls.length === 0` رد می‌شود؛ ۱ URL پشتیبانی می‌شود.
- مسیر audio (music/voiceover/clipVolume) مستقل از تعداد کلیپ ساخته و به `mergeVideoUrls` پاس می‌شود.
- خروجی به `mergedEntries` و Library اضافه می‌شود.

پس عملاً قابلیت موجود است؛ این پلن تنها چند اصلاح کوچک UX و یک مسیر بهینه برای حالت تک‌کارت اضافه می‌کند.

## Changes (UI-only, in `DashboardPage.tsx`)

1. **پیام/تولتیپ دکمه (~خط 2329)**
   - وقتی فقط ۱ کارت موجود است و موزیک یا ویس‌اور تنظیم شده، tooltip = «Apply soundtrack and save to Library».
   - وقتی ۱ کارت بدون audio است، tooltip = «Save this clip as a Final Film».
   - وقتی ۲+ کارت است، tooltip فعلی حفظ می‌شود.

2. **پیام لاگ/توست داخل `handleMergeAllVideos` (~خط 2015)**
   - اگر `urls.length === 1` → `input_prompt = 'Final clip — soundtrack applied'` (یا ساده «Final clip»). اگر چند کلیپ → همان «Final merged video — N clips».

3. **Guard اضافی برای حالت تک‌کارت بدون audio و بدون edit**
   - اگر `eligibleClips.length === 1` و audio نیست و کلیپ ادیت‌شده نیست → پیام راهنما کوتاه: «Add music/voiceover or trim/edit the card before finalizing» و ادامه نده.
   - اگر کاربر هر یک از این‌ها را داشت، روند معمول merge اجرا می‌شود (تک کلیپ از طریق canvas+MediaRecorder رندر می‌شود تا audio mux شود).

4. **بدون تغییر در منطق ذخیره‌سازی Library** — همان مسیر فعلی `mergedEntries`/`approvedIds` استفاده می‌شود.

## Why safe
- بدون تغییر در `mergeVideos.ts`، بک‌اند، RLS، یا storage.
- `slice(0, -1)` برای آرایه با ۱ عنصر = `[]` → transitions خالی، مشکل ندارد.
- Library cards فقط با آیکون سطل آشغال حذف می‌شوند (قانون قبلی حفظ شده).

## Out of scope
- تغییر در بک‌اند، edge functions، یا دیتابیس.
- تغییر در منطق دکمه‌های trash/edit/trim/save یا regenerate.
