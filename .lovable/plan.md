## Goal
یک آیکون کنار چیپ‌های نسبت تصویر (9:16 / 1:1 / 16:9) در نوار پایین اضافه شود که با کلیک، یک دیالوگ باز کند. کاربر در آن دیالوگ:
1) عکس خود را آپلود کند،
2) یکی از سه نسبت 9:16 / 1:1 / 16:9 را انتخاب کند،
3) دکمه Convert بزند تا Nano Banana عکس را به آن نسبت بازفریم/تبدیل کند،
4) خروجی را پیش‌نمایش ببیند و دانلود کند یا به‌عنوان Start frame استفاده کند.

## Files

### New: `supabase/functions/image-reframe/index.ts`
- Edge function (auth required) با ورودی JSON: `{ imageUrl: string, aspectRatio: '9:16'|'1:1'|'16:9' }`.
- اعتبارسنجی `imageUrl` با همان whitelist موجود (Supabase storage hosts) برای جلوگیری از SSRF (الگوی `enhance-prompt`).
- فراخوانی AI Gateway:
  - `model: "google/gemini-2.5-flash-image"`
  - `modalities: ["image", "text"]`
  - پیام چندبخشی شامل متن دستوری («Reframe the attached image to a strict {ratio} aspect ratio. Outpaint/extend background naturally where needed; do not crop the main subject. Keep style, lighting, and colors consistent. Output only the final image.») + `image_url` کاربر.
- استخراج base64 از `choices[0].message.images[0].image_url.url`، رمزگشایی و آپلود در bucket `user-images` تحت مسیر `{userId}/reframed-{ts}-{ratio}.png`.
- پاسخ: `{ publicUrl, path, aspectRatio }`.
- مدیریت خطاهای 429/402 مشابه `enhance-prompt`.
- بدون نیاز به config.toml override (verify_jwt پیش‌فرض پروژه).

### New: `src/modules/generator-ui/components/ImageReframeDialog.tsx`
- مبتنی بر `Dialog` shadcn. Props: `open`, `onOpenChange`, و callback اختیاری `onUseAsStartFrame(url)`.
- محتویات:
  - Dropzone/Input برای آپلود تک عکس (jpg/png/webp، max ~10MB).
  - گروه چیپ‌های نسبت (9:16 / 1:1 / 16:9) با نمایش پیش‌نمایش عکس آپلودشده در همان نسبت با `aspect-[9/16]` و غیره.
  - دکمه «Convert with Nano Banana» (در حالت loading اسپینر و درصد یا فقط spinner).
  - بعد از موفقیت: پیش‌نمایش نتیجه در نسبت انتخاب‌شده + دکمه‌های Download و «Use as Start frame» (اگر prop داده شده).
- جریان آپلود عکس کاربر:
  1) آپلود فایل به bucket `user-images` با مسیر `{userId}/reframe-input-{ts}.{ext}` و گرفتن publicUrl.
  2) فراخوانی edge function `image-reframe` با آن URL + ratio انتخابی.
  3) نمایش URL خروجی برگشتی.
- پیام خطا/توست برای حالت‌های 401/402/429/خطای عمومی.

### Edit: `src/modules/generator-ui/pages/DashboardPage.tsx`
- ایمپورت `ImageReframeDialog` و آیکون `Crop` (یا `Frame`) از `lucide-react`.
- state: `const [reframeOpen, setReframeOpen] = useState(false)`.
- بعد از بسته‌شدن `</div>` گروه نسبت‌ها (~خط 3487 پس از radiogroup «Aspect ratio»)، یک دکمه‌ی آیکونی اضافه شود:
  - ظاهر هماهنگ با دکمه‌های اطراف (rounded-full، border-white/10).
  - aria-label: "Reframe an image to a target aspect ratio"، title فارسی/انگلیسی کوتاه.
  - onClick: `setReframeOpen(true)`.
- رندر `<ImageReframeDialog open={reframeOpen} onOpenChange={setReframeOpen} onUseAsStartFrame={(url) => { /* attach to Start slot if image-to-video mode */ }} />` در انتهای فرم.
- فعلاً «Use as Start frame» (در صورت موجود بودن قلاب موجود)؛ اگر پیچیده شد فقط Download نگه می‌داریم تا scope کوچک بماند.

## Out of scope
- بدون تغییر در دیتابیس، RLS، یا منطق job orchestrator.
- بدون تغییر در دکمه‌های Final Film / Voiceover / Soundtrack.
- بدون افزودن credit accounting (می‌تواند بعداً اضافه شود).

## Why safe
- از همان bucket موجود `user-images` و الگوی edge function موجود (`enhance-prompt`) استفاده می‌شود.
- آیکون فقط یک افزودنی است؛ جریان‌های موجود تغییر نمی‌کنند.
- خروجی Nano Banana روی حساب همان کاربر در مسیر اختصاصی ذخیره می‌شود.

## Technical notes
- مدل: `google/gemini-2.5-flash-image` (Nano Banana، طبق دستور پروژه برای ویرایش تصویر).
- اگر مدل گاهی نسبت دقیق را رعایت نکند، در پرامپت قید "exact {ratio} aspect ratio, no letterboxing, no black bars" اضافه می‌شود.
