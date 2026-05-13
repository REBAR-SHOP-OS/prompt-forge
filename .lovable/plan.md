# Move Sparkles (AI Image) icon to the prompt bar

## Goal
آیکون Sparkles (تولید تصویر با AI) از نوار HISTORY حذف و دقیقاً کنار آیکون Crop در نوار پایینی پرامپت قرار گیرد.

## Changes
- `src/modules/generator-ui/pages/DashboardPage.tsx`:
  - حذف دکمه‌ی Sparkles از نوار HISTORY (حدود خطوط 3023–3031).
  - افزودن همان دکمه (با همان `onClick={() => setIsAiImageDialogOpen(true)}` و استایل رینگ-آیکون) بلافاصله بعد از دکمه‌ی Crop در نوار پرامپت (بعد از خط 3690)، با همان اندازه‌ی `h-8 w-8` و کلاس‌های هاور amber برای هماهنگی با Crop.
- بدون تغییر در `AiImageDialog`، edge functions، یا state.

## Verification
- آیکون Sparkles فقط در نوار پرامپت کنار Crop دیده می‌شود؛ در HISTORY دیگر وجود ندارد.
- کلیک روی آن دیالوگ AI Image را باز می‌کند.
