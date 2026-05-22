هدف: خروجی Final Film نباید بخش‌های فریز/تکرار فریم داشته باشد و ساخت ویدئوی نهایی باید پایدارتر از روش فعلی باشد.

ریشه‌ی مشکل
- Final Film الان در مرورگر با `canvas.captureStream + requestAnimationFrame + MediaRecorder` ساخته می‌شود.
- این روش به توان لحظه‌ای مرورگر، decode ویدئو، tab throttling، کندی شبکه و timing وابسته است.
- وقتی مرورگر حتی کوتاه‌مدت عقب می‌افتد، MediaRecorder آخرین فریم canvas را ادامه می‌دهد؛ نتیجه در فایل نهایی به شکل فریز بخشی از ویدئو دیده می‌شود.
- پس مشکل فقط پخش نیست؛ خود فایل خروجی می‌تواند با فریم‌های تکراری encode شود.

برنامه‌ی رفع دائمی
1. جایگزینی موتور merge فعلی با مسیر پایدارتر
   - در `mergeVideos.ts` از ضبط canvas/rAF برای کلیپ‌های ویدئویی فاصله می‌گیریم.
   - برای حالت‌های ساده و رایج Final Film، از capture مستقیم خود `<video>` استفاده می‌کنیم تا فریم‌ها از decoder واقعی ویدئو وارد MediaRecorder شوند، نه از repaint دستی canvas.
   - فقط برای clipهای تصویری/transitionهای بصری، مسیر canvas محدود و کنترل‌شده باقی می‌ماند.

2. محافظت در برابر clipهای ناسازگار
   - قبل از شروع merge، هر clip فقط بعد از رسیدن به `canplay`/metadata وارد فرآیند شود.
   - برای duration نامعتبر، videoWidth/videoHeight صفر، یا source کند/خراب، خطای قابل فهم نشان داده شود و clip خراب وارد Final Film نشود.

3. جلوگیری از encode شدن dead-time
   - هنگام seek/load/تعویض clip، recorder نباید زمان خالی یا فریم آخر clip قبلی را ضبط کند.
   - recorder در زمان‌های انتقال غیرواقعی pause/resume می‌شود تا زمان فایل خروجی فقط زمان واقعی پخش clipها باشد.

4. fallback امن برای موارد پیچیده
   - اگر کاربر transition تصویری، still-image clip، یا ترکیب صوتی پیچیده داشته باشد، مسیر canvas هنوز وجود دارد، اما با watchdog و کنترل lag تقویت می‌شود.
   - در صورت شناسایی افت شدید frame paint، merge متوقف می‌شود و به جای تولید فایل خراب، پیام retry/کاهش پیچیدگی نشان داده می‌شود.

5. اعتبارسنجی بعد از ساخت
   - بعد از merge، duration خروجی با مجموع duration ورودی‌ها مقایسه می‌شود.
   - اگر اختلاف غیرعادی باشد یا blob ناقص باشد، فایل در Library ثبت نمی‌شود تا Final Film خراب ذخیره نشود.

فایل‌های درگیر
- `src/modules/generator-ui/lib/mergeVideos.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx`
- در صورت نیاز کوچک: `src/modules/generator-ui/components/VideoWithSoundtrack.tsx` یا player مربوط به preview فقط برای اطمینان از پخش پایدار، نه تغییر UI.

ریسک و کنترل
- تغییر محدود به ساخت Final Film است و تولید کلیپ، Voiceover، Music و Library دست‌نخورده می‌مانند.
- اگر مرورگر/codec از capture مستقیم پشتیبانی نکند، fallback فعلی حفظ می‌شود تا قابلیت کاملاً از کار نیفتد.
- تمرکز روی حذف فریز واقعی داخل فایل خروجی است، نه صرفاً مخفی کردن مشکل در پلیر.