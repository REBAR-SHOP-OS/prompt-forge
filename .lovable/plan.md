هدف نهایی: ابزار Trim بدون گیرکردن روی 100٪ یا timeout، ویدیو را برش دهد و خروجی قابل پخش تحویل بدهد.

ریشه مشکل
- فایل‌های `/ffmpeg/ffmpeg-core.js` و `.wasm` از سرور با وضعیت 200 برمی‌گردند، پس مشکل 404 یا مسیر فایل نیست.
- کد فعلی `ffmpeg-core.js` را با `toBlobURL` به blob تبدیل می‌کند. داخل core، آدرس wasm از طریق hash همان blob پیدا می‌شود. در این حالت بارگذاری wasm 31MB ممکن است در Worker گیر کند و `ff.load()` پیام برگشت ندهد؛ نتیجه همان timeout 60000ms است.
- fallback فعلی هم همان الگو را با CDN تکرار می‌کند، پس اگر local به‌خاطر معماری load گیر کند، remote هم احتمالاً همان timeout را می‌دهد.

برنامه اصلاح
1. تغییر معماری load FFmpeg از blob-wrapped core به asset مستقیم هم‌مبدأ:
   - در `src/modules/generator-ui/lib/transcodeToMp4.ts`، `toBlobURL('/ffmpeg/ffmpeg-core.js')` حذف شود.
   - `ff.load({ coreURL: new URL('/ffmpeg/ffmpeg-core.js', window.location.origin).href, wasmURL: new URL('/ffmpeg/ffmpeg-core.wasm', window.location.origin).href })` استفاده شود.
   - چون core و wasm هر دو از همان origin پروژه سرو می‌شوند، نیاز به blob برای دورزدن CORS نیست.

2. مقاوم‌سازی load و fallback:
   - قبل از load، فایل‌های local با `fetch(..., { cache: 'force-cache' })` به‌صورت سبک بررسی شوند تا خطای شبکه واضح‌تر شود.
   - fallback remote فقط زمانی استفاده شود که local واقعاً fail کند، اما مسیر اصلی فقط local باشد.
   - پیام خطا از «timeout مبهم» به پیام قابل تشخیص‌تر تبدیل شود: local asset reachable / wasm reachable / load failed.

3. جلوگیری از گیرکردن UI:
   - اگر load شکست، singleton و promise حتماً reset شوند تا تلاش بعدی روی instance خراب قبلی نماند.
   - timeout فعلی حفظ شود، اما cleanup بعد از timeout کامل‌تر شود.

4. پاکسازی کد مرده:
   - import بدون استفاده `toBlobURL` حذف شود.
   - مسیر دوگانه‌ی blob local که عامل اصلی مشکل است حذف شود.
   - فقط یک مسیر روشن برای local load باقی بماند.

5. اعتبارسنجی بعد از تغییر:
   - بررسی شود فایل TypeScript از نظر import و مسیرها تمیز است.
   - در preview، درخواست‌های `/ffmpeg/ffmpeg-core.js` و `/ffmpeg/ffmpeg-core.wasm` باید 200 باشند.
   - اجرای Trim باید از مرحله Loading encoder عبور کند و وارد Encoding/Finalizing شود، نه timeout load.

ریسک‌ها
- اگر مرورگر/محیط preview دانلود wasm 31MB را بسیار کند انجام دهد، هنوز ممکن است زمان load زیاد شود؛ اما دیگر به blob indirection وابسته نیست و خطا قابل تشخیص‌تر خواهد بود.
- اگر پس از load، encode روی کلیپ‌های بزرگ OOM شود، آن مشکل جدا از load است و با پیام encode مشخص خواهد شد.