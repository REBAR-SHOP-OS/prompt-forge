## هدف
وقتی نسبت ابعاد تصویر آپلود‌شده با نسبت انتخابی کاربر (9:16 / 1:1 / 16:9) متفاوت است، تصویر باید **کامل** درون فریم انتخابی نمایش داده شود (object-contain با پس‌زمینه مشکی letterbox/pillarbox)، نه crop شود — و خروجی provider هم باید همین شکل باشد.

## استراتژی
قبل از فراخوانی `jobs-create`، تصویر/تصاویر ورودی را روی یک canvas با ابعاد دقیق نسبت انتخابی (مثلاً 720×1280 برای 9:16) با object-contain رندر می‌کنیم، نسخه‌ی نرمال‌شده را در همان bucket (`wan-frames`) آپلود می‌کنیم و URL جدید را به‌جای URL اصلی به provider می‌فرستیم. provider هم همان فریم آماده را به ویدیوی همان نسبت تبدیل می‌کند.

## تغییرات

### فایل جدید: `src/modules/generator-ui/lib/normalizeImageToRatio.ts`
Export یک تابع:
```ts
normalizeImageToRatio(srcUrl: string, ratio: '9:16'|'1:1'|'16:9'): Promise<Blob>
```
- ابعاد هدف: 720×1280 (9:16)، 1024×1024 (1:1)، 1280×720 (16:9).
- canvas را با مشکی پر می‌کند، تصویر را با `object-contain` (scale = min(w/sw, h/sh)) وسط‌چین می‌کشد.
- خروجی PNG Blob با ابعاد دقیق هدف.

### فایل: `src/modules/generator-ui/pages/DashboardPage.tsx`

**1) Import** تابع جدید کنار سایر imports.

**2) helper جدید درون component** (نزدیک `uploadFrameFile`):
```ts
async function prepareFrameForRatio(srcUrl: string, ratio: Ratio, target: 'start'|'end'): Promise<string> {
  const blob = await normalizeImageToRatio(srcUrl, ratio)
  const userId = session?.user?.id
  if (!userId) return srcUrl
  const path = `${userId}/${target}-norm-${ratio.replace(':','x')}-${Date.now()}-${crypto.randomUUID()}.png`
  const { error } = await supabase.storage.from(FRAMES_BUCKET).upload(path, blob, { contentType: 'image/png', upsert: false })
  if (error) { console.error('frame normalize upload failed', error); return srcUrl }
  return supabase.storage.from(FRAMES_BUCKET).getPublicUrl(path).data.publicUrl
}
```

**3) در `handleEnter`/submit (حدود خط 1100-1130)** قبل از فراخوانی `jobOrchestratorGateway.createJob`، URLهای فریم را با نسبت `effectiveRatio` نرمال کن:
```ts
const startUrl = readyStartFrame?.url
  ? await prepareFrameForRatio(readyStartFrame.url, effectiveRatio, 'start')
  : null
const endUrl = readyEndFrame?.url
  ? await prepareFrameForRatio(readyEndFrame.url, effectiveRatio, 'end')
  : null
```
سپس در همه‌ی شاخه‌های `createJob` به‌جای `readyStartFrame.url`/`readyEndFrame.url` از `startUrl`/`endUrl` استفاده شود. `seedFrames` هم با URLهای جدید پر شود تا preview محلی همان frame letterboxed را نشان دهد.

**4) (اختیاری/سازگار)** هیچ تغییری در RLS یا backend لازم نیست؛ از همان bucket و همان مسیر کاربر استفاده می‌کند.

## چرا امن است
- آپلود اولیه‌ی کاربر دست‌نخورده باقی می‌ماند؛ فقط یک نسخه‌ی نرمال‌شده‌ی **مشتق‌شده** اضافه می‌شود.
- اگر آپلود نرمال‌سازی fail کرد، fallback به URL اصلی است — جریان شکسته نمی‌شود.
- ابعاد و نسبت ارسالی به provider با `aspectRatio` همگام است (طبق تغییر قبلی)، پس provider خروجی را با همان نسبت تولید می‌کند و چون فریم ورودی letterboxed است، تصویر کامل دیده می‌شود.
- چون پس‌زمینه مشکی است، با theme فعلی (سیاه) سازگار است و در preview/Final Film یکدست به‌نظر می‌رسد.

## نتیجه
- 9:16 با تصویر افقی → تصویر کامل افقی در وسط، نوارهای مشکی بالا و پایین.
- 16:9 با تصویر عمودی → تصویر کامل عمودی در وسط، نوارهای مشکی چپ و راست.
- 1:1 با هر نسبت → تصویر کامل وسط، نوارهای مشکی در طرف کوتاه‌تر.
- در تمام موارد، خروجی ویدیویی provider دقیقاً با همان ترکیب‌بندی letterboxed تولید می‌شود.
