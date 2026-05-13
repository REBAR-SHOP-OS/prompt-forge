# Mask-based local edits (paint an area, edit with prompt)

## Goal
کاربر بتواند روی عکس تولیدشده یک ناحیه را با قلم رنگ بزند و سپس با پرامت، فقط همان ناحیه را با AI تغییر دهد. بقیه‌ی تصویر دست‌نخورده بماند.

## UX (داخل `AiImageDialog`)
- دکمه‌ی جدید آیکونی **Brush/Edit area** کنار «Apply edit» (همان جایی که در اسکرین‌شات با سبز مشخص شده).
- وقتی فعال است:
  - یک overlay canvas روی تصویر فعال می‌شود؛ با موس/لمس قلم می‌کشد (حالت preview بدون نقاشی غیرفعال).
  - کنترل‌های کوچک: **Brush size** (slider 8–80px)، **Clear mask** (دکمه)، خروج از حالت Edit area.
  - رنگ ماسک نیمه‌شفاف صورتی برای دیده شدن.
- وقتی mask وجود دارد و کاربر «Apply edit» می‌زند، درخواست با ماسک ارسال می‌شود؛ در غیر این صورت مثل قبل (ویرایش کلی) عمل می‌کند.
- اگر کاربر mask نکشید ولی Edit area روشن است → پرامت روی کل تصویر اعمال می‌شود (fallback).

## Frontend changes
- `src/modules/generator-ui/components/AiImageDialog.tsx`
  - state: `isMaskMode`, `brushSize`, `maskDataUrl` (PNG شفاف با ناحیه‌ی پر شده).
  - یک کامپوننت داخلی `MaskCanvas` (بدون فایل جدید — همانجا) که روی `<img>` لایه می‌گذارد، رویدادهای pointer (down/move/up) را برای کشیدن سفید مات روی canvas مخفی، و یک canvas نمایشی روی تصویر می‌گیرد.
  - وقتی mask تغییر کرد، `maskDataUrl` به‌روز می‌شود.
  - در `handleRefine`: اگر `maskDataUrl` موجود است → `body: { prompt, imageUrl, maskUrl, aspectRatio }`؛ در نهایت پس از موفقیت، ماسک پاک شود و حالت Edit area بسته شود.
  - بعد از Generate/Regenerate و Refine موفق، ماسک ریست می‌شود.

## Backend changes
- `supabase/functions/ai-image-edit/index.ts`
  - پذیرش اختیاری `maskUrl: string` (data:image/png;base64).
  - وقتی mask هست:
    - مدل: همان `google/gemini-3.1-flash-image-preview`.
    - پیام شامل دو تصویر: original و mask، با متنی شفاف:
      > Use the second image as a mask. Only modify pixels in the original image where the mask is opaque/white. Keep everything outside the mask pixel-identical (composition, colors, lighting, subject pose). Apply the following change inside the masked area only: <prompt>.
    - حفظ `image_config: { aspect_ratio }` در صورت ارسال.
  - اعتبارسنجی mask مثل imageUrl (data:image/* یا https://supabase host)، حداکثر اندازه.

## Out of scope
- بدون تغییر در جریان Generate اولیه، Final Film، DB، RLS، یا منطق aspect-normalize.
- بدون undo/redo حرفه‌ای — فقط Clear mask کافی است.

## Verification
1. تولید یک عکس → روشن کردن Edit area → کشیدن ماسک روی صورت → پرامت «change to short curly hair» → فقط همان ناحیه تغییر می‌کند، بقیه دست‌نخورده.
2. بدون mask، Apply edit مثل قبل کل تصویر را ویرایش می‌کند.
3. Clear mask و خروج از حالت Edit area سالم کار می‌کند.
4. Aspect ratio نهایی همچنان دقیقاً برابر انتخاب کاربر می‌ماند.
