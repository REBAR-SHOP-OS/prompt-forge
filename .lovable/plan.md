# ویرایش پرامت و ساخت مجدد از روی هر کارت

به هر کارت History (و به‌صورت اختیاری Library) یک دکمه‌ی ✏️ «ویرایش و ساخت مجدد» اضافه می‌شود. با کلیک روی این دکمه:

1. پرامت همان ویدئو در composer پایین صفحه بارگذاری می‌شود.
2. اگر کارت Image-to-Video بوده، فریم‌های Start/End آن به عنوان seed در uploader قرار می‌گیرند (مثل رفتار فعلی Reuse). اگر Text-to-Video بوده، حالت composer به Text-to-Video سوئیچ می‌کند.
3. composer focus می‌گیرد و کاربر می‌تواند پرامت را ویرایش کند.
4. با زدن Submit همان فلوی ساخت معمولی اجرا می‌شود (یک job جدید). کارت اصلی دست‌نخورده باقی می‌ماند تا کاربر بتواند نسخه‌های مختلف را مقایسه کند.

این کار از مکانیزم Reuse موجود (که در `pages/DashboardPage.tsx` خط ۸۳۳–۸۸۰ اطراف کار می‌کند) استفاده می‌کند تا کد جدید کم باشد.

## تغییرات

**`src/modules/generator-ui/pages/DashboardPage.tsx`**
- یک تابع جدید `editAndReuseJob(job: JobDetail)` اضافه می‌شود که:
  - `setPromptText(job.input_prompt)`
  - اگر `first_frame_url` یا `last_frame_url` دارد → `setGenerationMode('image-to-video')` و ساخت `UploadedFile`های ready با همان URLها (مشابه seed موجود).
  - در غیر این صورت → `setGenerationMode('text-to-video')` و `setUploadedFiles([])`.
  - بستن پنل History/Library در صورت باز بودن.
  - `promptInputRef.current?.focus()` و scroll به composer.
- در map مربوط به History (خط ۱۲۵۰–۱۳۳۶) یک دکمه‌ی جدید با آیکون `Pencil` (یا `RotateCcw` که قبلاً import شده) کنار دکمه‌های Bookmark/Trash اضافه می‌شود؛ `onClick` آن `event.stopPropagation()` و `editAndReuseJob(video)` را صدا می‌زند.
- همان دکمه در کارت‌های Library (خط ۱۴۹۲–۱۵۱۵) هم تکرار می‌شود.

تنها همین فایل تغییر می‌کند. هیچ تغییر بکند یا migration لازم نیست — هر بار ساخت یک job جدید مستقل با هزینه‌ی اعتبار عادی است.
