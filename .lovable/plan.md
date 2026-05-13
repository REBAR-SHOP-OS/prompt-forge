# تولید عکس با AI (Nano Banana) از داشبورد

افزودن یک آیکون «Generate image with AI» در نوار ابزار HISTORY (کنار آیکون آپلود تصویر) که یک دیالوگ باز می‌کند برای تولید عکس با پرامت در سه نسبت (1:1، 9:16، 16:9) و سپس ویرایش تکرارشونده‌ی همان عکس با Nano Banana.

## رفتار کاربری

1. **آیکون جدید** (Sparkles) در همان ردیفی که `ImagePlus` و `+` هست، با tooltip «Generate image with AI».
2. کلیک → دیالوگ `AiImageDialog` باز می‌شود با مراحل زیر:
   - **انتخاب نسبت ابعاد**: سه دکمه‌ی بزرگ `1:1` / `9:16 (Reels)` / `16:9 (YouTube)` — پیش‌فرض = نسبت قفل‌شده‌ی پروژه (`lockedProjectRatio`) یا `aspectRatio` فعلی.
   - **پرامت**: یک `Textarea` چندخطی با placeholder انگلیسی.
   - دکمه‌ی **Generate** → صدا زدن edge function `ai-image-generate`، لودینگ، و نمایش تصویر در یک قاب با همان نسبت.
3. وقتی عکس آماده شد:
   - دکمه‌ی **Use this image** → عکس را در `USER_IMAGES_BUCKET` آپلود می‌کند، یک ردیف در `generator_user_images` اضافه می‌کند، و در گرید HISTORY مثل بقیه‌ی تصاویر آپلودی نمایش می‌دهد. دیالوگ بسته می‌شود.
   - دکمه‌ی **Refine with AI** → یک ورودی پرامت ویرایش زیر تصویر باز می‌کند («Make the sky purple…»). با ارسال، edge function `ai-image-edit` فراخوانی می‌شود، تصویر فعلی به‌عنوان مرجع داده می‌شود، و تصویر جایگزین می‌شود. این مرحله را می‌توان چند بار تکرار کرد.
   - دکمه‌ی **Regenerate** → تولید دوباره با همان پرامت/نسبت.
   - دکمه‌ی **Discard** → پاک کردن نتیجه و برگشت به فرم پرامت.
4. خطاها (429 / 402 / network) با toast/متن قرمز داخل دیالوگ نمایش داده می‌شوند بدون افشای کلید.

## پیاده‌سازی فنی

### Backend — دو edge function جدید

- `supabase/functions/ai-image-generate/index.ts`
  - ورودی: `{ prompt: string, aspectRatio: '1:1'|'9:16'|'16:9' }`
  - احراز هویت با `authenticate(req)` (همان الگوی بقیه‌ی توابع).
  - فراخوانی `https://ai.gateway.lovable.dev/v1/chat/completions` با `model: 'google/gemini-2.5-flash-image'` و `modalities: ['image','text']`. نسبت ابعاد به‌صورت متنی در پرامت اضافه می‌شود (مثلاً «Output exactly in 9:16 portrait aspect ratio»).
  - استخراج base64 از `choices[0].message.images[0].image_url.url`.
  - خروجی: `{ dataUrl: string }` (همان data URL، تا کلاینت نمایش دهد و در صورت Use this image آپلود کند).
  - مدیریت خطاهای 429 و 402 مطابق راهنما.
- `supabase/functions/ai-image-edit/index.ts`
  - ورودی: `{ prompt: string, imageDataUrl: string }`.
  - همان مدل `google/gemini-2.5-flash-image` با `image_url` در content.
  - خروجی: `{ dataUrl: string }`.
- هر دو در `supabase/config.toml` با `verify_jwt = true` (پیش‌فرض پروژه) اضافه می‌شوند تا فقط کاربران لاگین‌شده دسترسی داشته باشند.

### Frontend

- فایل جدید `src/modules/generator-ui/components/AiImageDialog.tsx`:
  - state: `step: 'compose' | 'result'`, `aspect`, `prompt`, `editPrompt`, `imageDataUrl`, `isLoading`, `error`.
  - فراخوانی توابع از طریق `supabase.functions.invoke('ai-image-generate', { body })` و `'ai-image-edit'`.
  - دکمه‌ی Use this image: data URL → `Blob` → آپلود به `USER_IMAGES_BUCKET` (مسیر `${userId}/ai-${crypto.randomUUID()}.png`) → insert در `generator_user_images` → `onSaved(row)` تا والد به `userImages` اضافه کند.
- در `DashboardPage.tsx`:
  - state جدید `isAiImageDialogOpen`.
  - یک دکمه‌ی جدید `Sparkles` در toolbar HISTORY بین `ImagePlus` و `+`.
  - رندر `<AiImageDialog open={isAiImageDialogOpen} onOpenChange={setIsAiImageDialogOpen} userId={userId} defaultAspect={lockedProjectRatio ?? aspectRatio} onSaved={(row) => setUserImages((p) => [row, ...p])} />`.

### بدون تغییر در

- `mergeVideos.ts`، Final Film، Voiceover/Music، DB schema (از همان جدول `generator_user_images` استفاده می‌شود).
- منطق پلیر زنجیره‌ای (تصاویر تولیدشده دقیقاً مثل تصاویر آپلودی در پیش‌نمایش زنجیره‌ای ظاهر می‌شوند).

## ملاحظات

- نسبت ابعاد نهایی توسط مدل تضمین قطعی نمی‌شود؛ ما در پرامت قید می‌کنیم و در سمت کلاینت قاب نمایش را به همان نسبت می‌بریم. در صورت نیاز در آینده می‌توان از `image-reframe` موجود برای crop دقیق استفاده کرد.
- هزینه: هر Generate/Refine یک فراخوانی Lovable AI Gateway مصرف می‌کند (نه کردیت ویدئو).
- امنیت: کلید `LOVABLE_API_KEY` فقط در edge function استفاده می‌شود.

## معیار پذیرش

- آیکون Sparkles در toolbar HISTORY دیده شود.
- باز کردن دیالوگ → انتخاب نسبت → نوشتن پرامت → کلیک Generate → عکس در همان قاب با نسبت درست نمایش داده شود.
- Refine with AI با پرامت دوم → عکس به‌روزرسانی شود، تاریخچه‌ی نسخه‌ی قبل لازم نیست.
- Use this image → عکس بلافاصله در گرید HISTORY ظاهر شود و در پلیر زنجیره‌ای پخش شود.
- خطاهای 429/402 با پیام انسانی به کاربر نشان داده شوند.
