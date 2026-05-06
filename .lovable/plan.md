# مشکل
وقتی روی آیکون «اتصال کارت‌ها» (merge) می‌زنی و ویدیوی نهایی ادغام‌شده دانلود می‌شه، **بدون صدا** است. اما دانلود تک‌تک کارت‌ها صدا داره.

## ریشه مشکل
فایل `src/modules/generator-ui/lib/mergeVideos.ts` ادغام رو با `canvas.captureStream()` + `MediaRecorder` انجام می‌ده. این روش فقط فریم‌های تصویری canvas رو ضبط می‌کنه و audio track ویدیوها کلاً حذف می‌شه. در کامنت بالای فایل هم صریح نوشته شده:
> "Audio is dropped in v1 (canvas/MediaRecorder audio mux is fragile)."

# راه‌حل
بازنویسی `mergeVideos.ts` با ترکیب stream تصویری canvas و stream صوتی هر کلیپ از طریق `WebAudio API`:

1. ساخت یک `AudioContext` و `MediaStreamAudioDestinationNode` مشترک
2. برای هر ویدیو: گرفتن `MediaElementAudioSourceNode` از `<video>` و وصل کردن به destination مشترک (به جای خروجی speaker)
3. ترکیب `canvas.captureStream()` (ویدیو) + `destination.stream` (صوت) در یک `MediaStream` واحد
4. دادن این stream ترکیبی به `MediaRecorder` با `mimeType: 'video/webm;codecs=vp9,opus'` (یا fallback به vp8/opus)
5. حذف `muted=true` از تگ video (لازمه برای autoplay اما باید صدا از طریق WebAudio routing بره — استفاده از `video.muted=true` همراه با `MediaElementSource` در WebAudio کار نمی‌کنه چون در بعضی مرورگرها سورس صامت می‌شه؛ راه‌حل: `muted=false` + `volume=0` روی خود element تا از speaker پخش نشه ولی WebAudio صدا رو بگیره). در عمل بهترین روش: نگه داشتن `muted=true` روی element و استفاده از `AudioContext.createMediaElementSource` که در اکثر مرورگرها صدا رو حتی با element.muted=true به graph می‌فرسته — اگر مشکل ساز شد، fallback به `volume=0`.
6. بسته شدن AudioContext در پایان برای آزادسازی منابع

## نکات فنی
- `MediaElementAudioSourceNode` فقط یک‌بار در طول عمر element قابل ساخته شدن است؛ پس برای هر ویدیو که load می‌کنیم، فوراً source بسازیم و نگه داریم
- اگر کلیپی audio track نداشت، چیزی به graph اضافه نمی‌شه (silent gap طبیعیه)
- mimeType جدید: اول `video/webm;codecs=vp9,opus`، بعد `video/webm;codecs=vp8,opus`، در نهایت `video/webm`
- خروجی همچنان `.webm` باقی می‌مونه (بدون تغییر در نام/پسوند فایل)

## فایل‌های تحت تأثیر
- `src/modules/generator-ui/lib/mergeVideos.ts` — تنها فایل ویرایش‌شده

## تضمین رفتار
- ظاهر UI و آیکون merge هیچ تغییری نمی‌کنه
- نام فایل دانلودی، فرمت webm، و progress callback همگی یکسان باقی می‌مونن
- فقط track صوتی به خروجی اضافه می‌شه
