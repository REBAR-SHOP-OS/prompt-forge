## مشکل

وقتی روی دکمه merge (آیکون grid بالا-چپ) کلیک می‌شود، خروجی نهایی «Final merged video» تولید شده اما **بدون صدا** است.

علت در `src/modules/generator-ui/lib/mergeVideos.ts`:
- ویدیوها با `video.muted = true` پخش می‌شوند.
- فقط `canvas.captureStream(fps)` به عنوان منبع به `MediaRecorder` داده می‌شود — هیچ track صوتی وجود ندارد.
- کامنت خط ۶ خود فایل هم می‌گوید: «Audio is dropped in v1».

## راه‌حل

افزودن track صوتی هر کلیپ به stream ضبط‌شده، بدون تغییر منطق ادغام تصویری و بدون تغییر UI.

### تغییرات در `src/modules/generator-ui/lib/mergeVideos.ts`

1. **منبع صدا**: برای هر `<video>`، با `(video as any).captureStream()` استریم آن ویدیو را گرفته و `getAudioTracks()` را استخراج می‌کنیم. این روش در Chrome/Edge/Firefox مدرن پشتیبانی می‌شود (مرورگرهای هدف Lovable preview).
   - Fallback: اگر `captureStream` در دسترس نبود، از `AudioContext` + `createMediaElementSource(video)` + `MediaStreamDestination` استفاده می‌کنیم.

2. **Unmute هنگام ضبط**: `video.muted = false` و `video.volume = 0` برای ویدیوی in-flight (تا کاربر صدای میکس را موقع ادغام نشنود ولی track صوتی واقعی به stream برسد). توجه: `volume = 0` صدای playback را قطع می‌کند ولی track صوتی همچنان به captureStream می‌رسد. اگر این رفتار قابل اتکا نبود، از مسیر `AudioContext` استفاده می‌کنیم که مستقل از playback gain است — این مسیر امن‌تر است و آن را به‌عنوان روش اصلی انتخاب می‌کنیم.

3. **Mux کردن**: یک `MediaStream` ترکیبی بسازیم که:
   - track ویدیویی = `canvas.captureStream(30).getVideoTracks()[0]` (یک‌بار، ثابت)
   - track صوتی = خروجی یک `AudioContext` با `MediaStreamDestination` که برای هر کلیپ، `MediaElementAudioSourceNode` ویدیوی فعلی به آن وصل می‌شود.
   - چون `createMediaElementSource` فقط یک‌بار قابل اتصال به یک عنصر است و عناصر ویدیویی هر کلیپ تازه ساخته می‌شوند، این مشکلی ایجاد نمی‌کند.
   - `MediaRecorder` روی این stream ترکیبی استارت می‌شود (یک‌بار، در ابتدا) و تا انتهای آخرین کلیپ ادامه می‌یابد.

4. **MIME type**: `video/webm;codecs=vp9,opus` (یا vp8,opus) را به لیست candidates اضافه می‌کنیم تا audio codec هم declare شود.

5. **پاک‌سازی**: در پایان، `audioContext.close()` را فراخوانی می‌کنیم.

### رفتار کلیپ‌های still-image (لوگوی End frame)

این کلیپ‌ها از `imageUrlToClip` می‌آیند که فقط ویدیوی webm بدون صدا تولید می‌کنند. برای آن‌ها track صوتی خالی است — هیچ صدایی اضافه نمی‌شود (همان رفتار سکوت طبیعی)، که قابل قبول است.

### بدون تغییر

- UI، آیکون grid، منطق آپلود، entry بانک merged-videos، و مسیر `handleMergeAllVideos` در `DashboardPage.tsx` بدون تغییر.
- منطق i2v/t2v و بک‌اند بدون تغییر.

## فایل تغییریافته

- `src/modules/generator-ui/lib/mergeVideos.ts`

## ریسک‌ها و کاهش

- **CORS صدا**: ویدیوها از طریق `proxiedVideoUrl` (همان edge function `video-proxy`) لود می‌شوند که هدر CORS صحیح دارد، پس `captureStream`/`AudioContext` روی این عناصر مشکلی ندارند.
- **Sync تصویر/صدا**: چون هر دو از یک `<video>` هم‌زمان (drawImage + audio source) می‌آیند، sync حفظ می‌شود.
- **اگر مرورگر AudioContext را قبل از gesture کاربر بلاک کند**: عمل merge همیشه پس از کلیک کاربر روی آیکون grid اتفاق می‌افتد، پس gesture وجود دارد.

## تأیید پس از پیاده‌سازی

پس از پیاده‌سازی، با ادغام ۲ کلیپ ویدیویی واقعی (مثل دو نمونه‌ی موجود در history کاربر) آزمایش می‌شود تا صدا در خروجی نهایی شنیده شود.
