## مشکل
دکمه‌ی **Download** که کاربر در اسکرین‌شات روی آن دایره کشیده، منوی **native مرورگر** (روی `<video controls>`) است. این منو فایل خام را که provider ساخته دانلود می‌کند — حتی اگر کاربر در UI نسبت `1:1` یا `16:9` انتخاب کرده باشد، فایل دانلودی همان نسبت اصلی provider را دارد. این منو از داخل کد قابل تغییر نیست.

## راه‌حل
1. منوی native دانلود مرورگر را با `controlsList="nodownload"` خاموش کنیم.
2. یک **دکمه‌ی Download سفارشی** بالای player اضافه کنیم که قبل از دانلود، ویدیو را **با aspect ratio انتخاب‌شده‌ی کاربر crop/re-encode می‌کند** (object-cover روی canvas + MediaRecorder → webm) و سپس فایل نهایی را دانلود می‌دهد.
3. همین منطق روی دکمه‌ی Download کارت‌های history (خط 2294) هم اعمال شود تا تجربه یکدست باشد.

## تغییرات

### فایل جدید: `src/modules/generator-ui/lib/downloadVideoAtRatio.ts`
یک utility export می‌کند:
```ts
downloadVideoAtRatio(src: string, ratio: '9:16'|'1:1'|'16:9', filename?: string): Promise<void>
```
- ویدیو را در یک `<video>` مخفی بارگذاری می‌کند (با `crossOrigin="anonymous"`).
- یک canvas با ابعاد دقیق نسبت انتخابی می‌سازد (مثلاً 1080×1080 برای 1:1، 608×1080 برای 9:16، 1080×608 برای 16:9).
- هر فریم را با **object-cover** (مقیاس ماکزیمم + center-crop) روی canvas می‌کشد.
- `canvas.captureStream(30)` + در صورت امکان `video.captureStream()` برای audio track → `MediaRecorder` با `video/webm`.
- پس از پایان پخش، blob را به‌صورت `clip-9x16.webm` دانلود می‌دهد.

### فایل: `src/modules/generator-ui/pages/DashboardPage.tsx`

**1) خط 1817-1824 (player اصلی)** — افزودن `controlsList="nodownload"` و `disablePictureInPicture` به تگ video برای حذف منوی سه‌نقطه native:
```tsx
<video
  ...
  controls
  controlsList="nodownload noremoteplayback"
  disablePictureInPicture
  ...
/>
```

**2) افزودن دکمه‌ی Download سفارشی** بالای player اصلی (در همان container دور خط 1815). دکمه: 
- وقتی `previewVideo.video?.storage_path` موجود است نمایش داده شود.
- روی کلیک → `downloadVideoAtRatio(src, getRatioFor(previewVideo))` فراخوانی شود.
- در حین پردازش، spinner و disabled شود؛ خطا با toast.

**3) خط 2294-2303 (history card download)** — تبدیل `<a download>` به `<button>` که `downloadVideoAtRatio(src, getRatioFor(video))` را صدا می‌زند تا دانلود از history نیز با نسبت انتخابی کاربر باشد.

**4) خط 2000-2010 (carousel `<video controls>`)** — افزودن `controlsList="nodownload"` برای جلوگیری از منوی native در آن تگ video هم.

## چرا امن است
- منطق provider/backend دست‌نخورده است؛ فقط لایه‌ی client-side download تغییر می‌کند.
- اگر مرورگر `MediaRecorder`/`captureStream` را پشتیبانی نکند (موارد بسیار نادر)، کد throw می‌کند و toast خطا نشان می‌دهد — ویدیوی اصلی حذف نمی‌شود.
- فایل خروجی webm است؛ تمام مرورگرهای مدرن و VLC/پلیرهای سیستم آن را پخش می‌کنند.
- audio track در صورت موفقیت captureStream حفظ می‌شود؛ در غیر این صورت ویدیوی silent دانلود می‌شود (همچنان با ابعاد درست).

## نتیجه
هر دانلود (چه از player اصلی، چه از کارت history، چه از منوی مرورگر) **دقیقاً با همان نسبت ابعادی که کاربر در نوار 9:16/1:1/16:9 انتخاب کرده** ذخیره می‌شود.
