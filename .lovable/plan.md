# Force generated images to match the chosen aspect ratio

## Problem
مدل `google/gemini-2.5-flash-image` (Nano Banana) معمولاً به دستورالعمل متنیِ aspect ratio پایبند نیست و عکس را در ابعاد دلخواه خود (اغلب مربعی) برمی‌گرداند. در نتیجه با وجود انتخاب 9:16 یا 16:9، خروجی اشتباه است.

## Root-cause fix (دو لایه‌ای)

### Layer 1 — Backend: درخواست aspect ratio به‌صورت پارامتر مدل
`supabase/functions/ai-image-generate/index.ts` و `ai-image-edit/index.ts`:
- ارتقای مدل پیش‌فرض به `google/gemini-3.1-flash-image-preview` (Nano Banana 2) که نسبت‌ ابعاد را بهتر رعایت می‌کند.
- ارسال `image_config: { aspect_ratio: aspectRatio }` در body درخواست (پارامتر رسمی Gemini image generation برای کنترل ابعاد).
- نگه داشتن guidance متنی به‌عنوان پشتیبان.
- در `ai-image-edit` نیز در صورت دریافت `aspectRatio`، همین پارامتر ارسال شود تا ویرایش‌ها هم ابعاد را نشکنند.

### Layer 2 — Client: نرمال‌سازی قطعی روی Canvas
حتی اگر مدل بی‌توجه باشد، خروجی روی کلاینت به نسبت دقیق هدف برش/پد می‌شود تا ۱۰۰٪ تضمین شود.

افزودن یک util کوچک:
- `src/modules/generator-ui/lib/normalizeImageAspect.ts`
  - ورودی: `dataUrl: string`, `aspect: '1:1'|'9:16'|'16:9'`
  - خروجی: `dataUrl` جدید با ابعاد دقیقاً مطابق نسبت هدف.
  - الگوریتم: بارگذاری تصویر در `Image`، محاسبه‌ی نسبت فعلی، اگر نزدیک به هدف بود (tolerance < 0.5%) همان را برگرداند؛ در غیر این صورت روی Canvas با حالت **cover (center crop)** برش زده شود تا نسبت دقیق شود (بدون نوار سیاه/کشیدگی). خروجی PNG.

به‌کارگیری در `AiImageDialog.tsx`:
- پس از موفقیت `handleGenerate` و `handleRefine`، قبل از `setImageDataUrl`، `dataUrl` را از `normalizeImageAspect(url, aspect)` عبور دهیم.
- در `handleRefine` همان `aspect` فعلی استفاده می‌شود، پس ویرایش‌ها هم نسبت را حفظ می‌کنند.
- در `handleUse` همان فایل نرمال‌شده آپلود می‌شود (تغییری لازم نیست چون state از قبل نرمال شده است).

## Out of scope
- بدون تغییر در منطق Final Film، Sequential Player، DB، یا Storage RLS.
- بدون تغییر UI (دیالوگ، دکمه‌ها، چینش).

## Verification
1. انتخاب 9:16 → پرامپت تستی → عکس برگشتی دقیقاً 9:16 (مثلاً 1024×1820 یا برش‌خورده تا نسبت برابر شود).
2. انتخاب 16:9 → عکس دقیقاً 16:9.
3. انتخاب 1:1 → عکس مربعی دقیق.
4. Refine روی عکس 9:16 → خروجی همچنان 9:16 می‌ماند.
5. Use this image → فایل آپلودشده در bucket همان نسبت را دارد و در پیش‌نمایش بدون distortion قاب می‌گیرد.
