## هدف

وقتی کاربر روی آیکون مداد (Edit) یک کارت History کلیک می‌کند و prompt جدید می‌نویسد، باید **همان کلیپ ادامه داده شود** — یعنی فریم آخر آن کلیپ به‌عنوان Start frame کلیپ بعدی استفاده شود، نه اینکه کلیپ اولیه با همان frames قدیمی دوباره ساخته شود.

## وضعیت فعلی

تابع `editAndReuseJob` در `src/modules/generator-ui/pages/DashboardPage.tsx` (خطوط ۱۱۷۴-۱۲۲۱) کارهای زیر را می‌کند:
- prompt قدیمی را در input قرار می‌دهد
- `first_frame_url` و `last_frame_url` قدیمی را به‌عنوان Start/End ست می‌کند

نتیجه: یک کلیپ تقریباً یکسان دوباره ساخته می‌شود — این "reuse" است نه "continue".

## راه‌حل

`editAndReuseJob` را به جریان continuation تبدیل کنیم — مشابه کاری که `handleAddVideoCard` (خط ۱۱۱۵) می‌کند، اما روی **همان کارتی که کاربر روی آن کلیک کرده**:

۱. prompt input خالی شود (کاربر prompt جدید برای ادامه می‌نویسد).
۲. اگر کلیپ `status === 'completed'` و `video.storage_path` دارد:
   - mode را روی `image-to-video` بگذار
   - فریم آخر همان ویدیو را با `captureLastFrameAsBlob` بگیر
   - در bucket `wan-frames` آپلود کن
   - URL عمومی را به‌عنوان Start frame ست کن (End خالی می‌ماند تا کاربر بخواهد)
۳. در حالت fallback (کلیپ هنوز رندر نشده): مثل قبل از frames اولیه استفاده کن و prompt قدیمی را برگردان.

چون قفل ratio پروژه از قبل اعمال شده، کلیپ ادامه‌ای خودبه‌خود همان ابعاد را خواهد داشت.

## تغییرات

- فقط فایل `src/modules/generator-ui/pages/DashboardPage.tsx`:
  - تابع `editAndReuseJob` را async کن.
  - signature گسترش پیدا کند تا `id`, `status`, و `video?.storage_path` را بپذیرد (در محل فراخوانی، کل object `video` پاس داده می‌شود که این فیلدها را دارد).
  - شاخه‌ی اصلی: capture-last-frame → upload → set as Start.
  - شاخه fallback (نه completed): رفتار قبلی reuse-frames با prompt قدیمی.

## نتیجه

با کلیک روی مداد یک کارت در History، composer آماده‌ی نوشتن prompt ادامه می‌شود؛ آخرین فریم همان کلیپ به‌عنوان Start گذاشته می‌شود و کلیپ بعدی واقعاً ادامه‌ی آن کارت خواهد بود — با همان ابعاد.
