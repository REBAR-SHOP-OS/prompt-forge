## Goal
دکمه‌ای کنار دکمه‌های Close/Download در دیالوگ Reframe اضافه شود که با کلیک، عکس بازفریم‌شده را مستقیم به اسلات «Start» در نوار چت‌باکس بفرستد و دیالوگ را ببندد.

## Status
کامپوننت `ImageReframeDialog` از قبل prop اختیاری `onUseAsStartFrame(publicUrl, aspectRatio)` دارد و دکمه «Use as Start frame» را وقتی این prop ست شده باشد نشان می‌دهد. کافی است این prop را در `DashboardPage` پاس بدهیم و یک handler بنویسیم.

## Changes (UI-only)

### `src/modules/generator-ui/pages/DashboardPage.tsx`
1. تابع `handleReframeAsStart(url, ratio)`:
   - اگر در حالت `text-to-video` هستیم → `setGenerationMode('image-to-video')` تا اسلات Start فعال شود.
   - اگر امکان قفل‌نشدن aspect ratio وجود دارد و `lockedRatio` تنظیم نشده → `setAspectRatio(ratio)` (در غیر این صورت بدون تغییر).
   - یک ورودی synthetic به `uploadedFiles` اضافه کند:
     ```ts
     setUploadedFiles((cur) => [...cur, {
       id: Date.now(),
       name: `reframed-${ratio.replace(':', 'x')}.png`,
       size: 0,
       target: 'Start',
       type: 'image/png',
       status: 'ready',
       url,
       error: null,
     }])
     ```
   - `setIsReframeOpen(false)` (دیالوگ بسته می‌شود).
   - یک toast کوتاه: «Added to Start frame».

2. در رندر دیالوگ، prop را پاس بدهیم:
   ```tsx
   <ImageReframeDialog
     open={isReframeOpen}
     onOpenChange={setIsReframeOpen}
     onUseAsStartFrame={handleReframeAsStart}
   />
   ```

3. تغییر آیکون داخل کامپوننت دیالوگ (اختیاری کوچک): دکمه «Use as Start frame» با آیکون `ImagePlus` یا `ArrowRightToLine` تا روشن‌تر باشد.

## Why safe
- `uploadedFile.url` صرفاً به‌عنوان publicUrl در ادامه‌ی فلو مصرف می‌شود؛ تفاوتی بین bucket `user-images` و `wan-frames` در سمت پایین‌دست وجود ندارد چون فقط URL مصرف می‌شود.
- اگر `lockedRatio` فعال باشد، دست به aspect ratio نمی‌زنیم تا قانون قفل پروژه شکسته نشود.
- بدون تغییر در بک‌اند، RLS، یا منطق job/Final Film.

## Out of scope
- بدون تغییر در دکمه‌های Final Film / Voiceover / Soundtrack.
- بدون افزودن «Use as End frame» (در صورت نیاز بعداً اضافه می‌شود).
