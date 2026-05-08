# ویرایشگر برش روی هر کارت ویدیو

## هدف
روی هر کارت History یک دکمه «✂ Edit» اضافه شود. با کلیک، یک مودال باز شود که:
- کل ویدیو را با یک Progress Bar بزرگ و قابل اسکراب نمایش دهد
- کاربر بتواند چند **بازه از وسط** را به‌عنوان «حذف‌شدنی» علامت بزند
- با Apply، نسخه جدید ویدیو در مرورگر ساخته شود و **جایگزین همان کارت** شود

## رفتار UI

### 1) دکمه روی کارت
کنار دکمه Delete موجود (در `DashboardPage.tsx` خط ۲۶۳۹ و ۲۸۵۸)، یک دکمه‌ی کوچک با آیکن قیچی اضافه می‌شود — `aria-label="Edit clip"`.

### 2) مودال ویرایشگر (`ClipTrimmerDialog`)
لایه‌بندی:
```text
┌──────────────────────────────────────────┐
│  <video preview — همان کارت>            │
│                                          │
│  ▶  00:02 / 00:05                       │
│  ├──█████──░░░──████████──┤   ← Timeline│
│         ↑ بازه حذف‌شده (قرمز)            │
│                                          │
│  [+ Mark cut from here] [Clear all]     │
│  بازه‌های حذف:                            │
│   • 0:01.2 → 0:02.0   [×]               │
│   • 0:03.5 → 0:04.1   [×]               │
│                                          │
│  [Cancel]            [Apply changes]    │
└──────────────────────────────────────────┘
```

تعامل تایم‌لاین:
- کلیک روی نوار = جابه‌جایی playhead
- دکمه «Mark cut from here» نقطه فعلی playhead را شروع یک بازه حذف می‌کند؛ کلیک دوم پایان آن را تعیین می‌کند
- هر بازه روی تایم‌لاین به رنگ قرمز نمایش داده می‌شود و دستگیره‌های چپ/راست برای جابه‌جایی دارد
- در حین Preview، playhead وقتی به ابتدای بازهٔ حذف می‌رسد به‌صورت خودکار به انتهای آن بازه می‌پرد (پیش‌نمایش زنده‌ی نتیجه بدون نیاز به render)

### 3) اعمال تغییرات
با Apply:
1. ویدیو در یک `<video>` مخفی پخش می‌شود و فقط فریم‌های خارج از بازه‌های حذف‌شده روی یک `<canvas>` کشیده می‌شوند
2. صدا از طریق `MediaElementAudioSourceNode` با همان بازه‌ها قطع/وصل می‌شود
3. خروجی با `MediaRecorder` ضبط می‌شود (MP4 اگر پشتیبانی شد، وگرنه WebM)
4. Blob نتیجه به‌عنوان `objectURL` در همان کارت می‌نشیند (state محلی) و یک نشانگر کوچک «Edited» روی کارت ظاهر می‌شود
5. مدت‌زمان کارت به مدت جدید آپدیت می‌شود

این دقیقاً همان تکنیک قبلی پروژه در `src/modules/generator-ui/lib/mergeVideos.ts` (canvas + MediaRecorder) است — هیچ کتابخانه‌ی جدیدی اضافه نمی‌شود.

## جزئیات فنی

### فایل‌های جدید
- `src/modules/generator-ui/lib/trimVideo.ts` — تابع `trimVideoLocally(srcUrl, cuts: Array<{start:number,end:number}>) → Promise<Blob>` بر اساس همان الگوی `mergeVideos.ts`
- `src/modules/generator-ui/components/ClipTrimmerDialog.tsx` — مودال shadcn `Dialog` با تایم‌لاین SVG/div + لیست بازه‌ها + پیش‌نمایش
- `src/modules/generator-ui/components/Timeline.tsx` — کامپوننت کوچک نوار زمان با هندل‌های قابل درگ

### فایل‌های ویرایش‌شونده
- `src/modules/generator-ui/pages/DashboardPage.tsx`
  - افزودن state `editedClips: Record<jobId, {url:string, duration:number}>`
  - افزودن دکمه Edit در دو نقطه‌ای که Delete رندر می‌شود (خط ۲۶۳۹ و ۲۸۵۸)
  - تابع `applyTrim(jobId, blob, newDuration)` — `URL.createObjectURL` + ست در map + revoke قبلی
  - جایی که `<video src={...}>` کارت رندر می‌شود، اگر `editedClips[id]` بود از آن استفاده شود

### نکات مهم
- **محدوده‌ی این feature صرفاً client-side است**: هیچ تماسی با backend، هیچ تغییری در DB، storage یا edge functions انجام نمی‌شود. نسخهٔ ویرایش‌شده فقط در sessionStorage/حافظه می‌ماند تا در صفحه فعلی دیده شود
- اگر کاربر صفحه را رفرش کند، نسخه اصلی برمی‌گردد (در این مرحله ذخیره دائمی نیست — اگر بعداً خواست، آپلود به storage را در فاز بعد اضافه می‌کنیم)
- هیچ تغییری روی credit/job system داده نمی‌شود

## خارج از scope
- ذخیرهٔ نسخه برش‌خورده در دیتابیس یا storage
- برش بیش‌از‌حد دقیق در حد فریم (دقت ~۰.۰۳ ثانیه کافی است)
- Undo بعد از Apply (می‌توان دکمه «Revert to original» اضافه کرد — در پایان فاز اول اضافه می‌کنم)
