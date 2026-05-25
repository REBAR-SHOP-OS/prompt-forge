## هدف
کنار آیکون قیچی (Trim) روی هر کارت ویدئو، یک آیکون **قرمز** اضافه شود با عنوان **Video-to-Video Editing**. با کلیک، دیالوگی باز می‌شود که کاربر یک پرامت متنی می‌نویسد (مثلاً «حال‌وهوای سینمایی سرد بده» یا «همه را به سبک کارتونی تبدیل کن»)، و ویدئو طبق آن پرامت ویرایش می‌شود.

## نکته مهم درباره مدل
مدل‌های Google موجود روی Lovable AI Gateway (Gemini) **مدل اختصاصی video-to-video** ندارند. تنها راه عملی با Google، **ویرایش فریم‌به‌فریم** با مدل ویرایش تصویر `google/gemini-3.1-flash-image-preview` (Nano Banana 2) و سپس مونتاژ مجدد فریم‌ها به ویدئو است.
- پیامد: زمان پردازش بالا (هر فریم یک تماس API)، احتمال «لرزش» بین فریم‌ها، و هزینه‌ی نسبتاً بالا.
- برای کنترل هزینه/زمان: نرخ نمونه‌برداری پایین (مثلاً ۴–۸ fps خروجی) و حداکثر طول ویدئو ۸ ثانیه.

اگر کاربر بعداً کیفیت پایدارتر بخواهد، می‌توان همان UI را به provider واقعی video-to-video (Runway/Replicate/Wan-VACE) سوییچ کرد بدون تغییر فرانت.

## تغییرات کد

### ۱. فرانت‌اند
- `src/modules/generator-ui/pages/DashboardPage.tsx`
  - import آیکون `Wand2` (یا `Sparkles`) از `lucide-react`.
  - state جدید: `const [v2vJobId, setV2vJobId] = useState<string|null>(null)`.
  - کنار دکمه Trim روی هر کارت (حدود خط ۵۳۶۷)، یک دکمه‌ی جدید گرد و **قرمز** اضافه شود:
    - شرط نمایش: همان شرط Trim (وقتی video وجود دارد).
    - رنگ: `border-rose-400/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25` (با توکن‌های Tailwind همان فایل، سازگار با تم تیره).
    - aria-label/title: `Video-to-Video Editing`.
  - رندر `<VideoToVideoDialog>` در پایین صفحه شبیه `ClipTrimmerDialog`.

- فایل جدید `src/modules/generator-ui/components/VideoToVideoDialog.tsx`:
  - Dialog با Textarea برای پرامت، Slider برای «شدت ویرایش» (۰.۲ تا ۰.۸، پیش‌فرض ۰.۵)، دکمه Apply.
  - پیشرفت مرحله‌ای: `Uploading → Editing frames (x/N) → Encoding → Saving`.
  - تماس به edge function جدید `video-to-video-edit` با `{ jobId, prompt, strength }`.
  - دریافت `storagePath` نهایی → فراخوانی `jobOrchestratorGateway.updateEditedVideo` (دقیقاً مثل مسیر Trim) تا کارت با نسخه‌ی ویرایش‌شده به‌روز شود.
  - مدیریت خطا: نمایش پیام، خروج از حالت busy.

### ۲. بک‌اند
- Edge function جدید: `supabase/functions/video-to-video-edit/index.ts`
  - ورودی: `{ jobId, prompt, strength }`. احراز هویت با `authenticate`. مالکیت job چک شود.
  - مراحل:
    1. دانلود ویدئو از `generator_video_assets` (storage `user-videos`).
    2. استخراج فریم‌ها با `ffmpeg` (از `npm:@ffmpeg-installer/ffmpeg` یا اجرای wasm سرور). محدودیت: حداکثر ۸ ثانیه و ۶ fps → حدود ۴۸ فریم.
    3. برای هر فریم: تماس به `https://ai.gateway.lovable.dev/v1/chat/completions` با `model: google/gemini-3.1-flash-image-preview`، پرامت `"Edit this frame: <user prompt>. Keep composition and subject identity consistent."` و تصویر فریم به‌صورت base64 (طبق dock `ai-image-generation`).
    4. مونتاژ فریم‌های ویرایش‌شده به MP4 با همان fps خروجی، حفظ صوت اصلی (mux مجدد).
    5. آپلود نتیجه به bucket `user-videos` تحت `userId/edited/<jobId>-<ts>.mp4`.
    6. خروجی: `{ storagePath, durationSeconds, aspectRatio }`.
  - مدیریت ۴۲۹ و ۴۰۲ از Gateway + بازگرداندن پیام واضح.
  - timeout عاقلانه (نزدیک سقف edge functions = ۱۵۰ ثانیه). اگر بیشتر شد، مرحله را موازی‌سازی محدود (concurrency=۴) کنیم.
  - بدون نیاز به migration دیتابیس (از همان جدول‌های جاب/asset استفاده می‌شود).

### ۳. اعتبارسنجی
- بعد از پیاده‌سازی: تست دستی روی یک کارت ۵ ثانیه‌ای با پرامت ساده. بررسی اینکه:
  - آیکون قرمز فقط روی کارت‌های دارای ویدئو ظاهر شود.
  - دیالوگ پرامت می‌گیرد، پیشرفت واقعی نمایش می‌دهد، در پایان کارت با نسخه‌ی جدید جایگزین می‌شود.
  - خطاها (۴۲۹/۴۰۲/timeout) به‌صورت toast/متن واضح نمایش داده شوند.

## آنچه تغییر نمی‌کند
- منطق Trim، Merge، Final Film، حذف کارت‌ها و سایر آیکون‌ها دست‌نخورده می‌ماند.
- هیچ تغییر اسکیمای دیتابیس لازم نیست.
- هیچ Secret جدیدی لازم نیست (`LOVABLE_API_KEY` کفایت می‌کند).

## ریسک‌ها (شفاف)
- **پایداری زمانی بین فریم‌ها**: Nano Banana برای هر فریم مستقل عمل می‌کند، بنابراین خروجی ممکن است کمی «لرزان» باشد. در پرامت سیستم تاکید می‌شود ترکیب‌بندی حفظ شود، ولی تضمین کامل نیست.
- **زمان پردازش**: برای ویدئوی ۵ ثانیه (۳۰ فریم در ۶fps) با concurrency=۴، حدود ۳۰–۶۰ ثانیه طول می‌کشد.
- **محدودیت ۱۵۰ ثانیه edge function**: حداکثر طول ورودی به ۸ ثانیه محدود می‌شود؛ در UI پیغام داده می‌شود.
