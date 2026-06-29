### هدف نهایی
صدا و موزیک در Preview، Final Film و وقتی Final دوباره به Draft برمی‌گردد باید پایدار، بدون نویز/به‌هم‌ریختگی، و بدون دوبل‌شدن/از دست رفتن اجرا شود.

### مشکل واقعی که پیدا شد
- مسیر فعلی چند موتور هم‌زمان برای یک صدا دارد: WaveSurfer برای نمایش، `<audio>` مخفی برای پخش، و در Final Film یک mixer جدا. این باعث race، seekهای تکراری و گاهی دوبل/نویز می‌شود.
- در `PreviewSoundtrackWaveforms` هر `timeupdate` می‌تواند voice/music را seek/play کند؛ برای voiceover این کار روی صدای انسانی می‌تواند glitch/noise بسازد.
- در `mergeVideosWebCodecs.ts` صدای نهایی با AAC/WebCodecs encode می‌شود، اما قبل از encode هیچ limiter/normalizer وجود ندارد. اگر music + voiceover + clip audio جمعاً از سقف عبور کنند، خروجی می‌تواند clipping و نویز داشته باشد.
- مسیر Final→Draft فقط URL/نام track را نگه می‌دارد؛ range/timeline/volume/mode را از snapshot اصلی برنمی‌گرداند، پس بعد از reopen ممکن است موسیقی/نریشن با زمان‌بندی یا ولوم اشتباه اجرا شوند.

### تغییرات پیشنهادی
1. **یک مسیر واحد برای Preview audio**
   - WaveSurfer فقط waveform را بسازد و هرگز درگیر playback نباشد.
   - پخش فقط با native `<audio>` انجام شود.
   - `play()` فقط یک بار و بعد از sync/seek اجرا شود؛ از play/seek تکراری در هر tick جلوگیری شود.

2. **حذف عامل نویز در sync زنده**
   - برای voiceover، در `syncTime` فقط وقتی drift زیاد است seek شود؛ نه روی هر `timeupdate`.
   - برای music looping هم threshold و clamp امن‌تر شود تا در مرز loop کلیک/پرش ندهد.
   - هنگام تغییر URL، audio قبلی کامل pause/reset/unload شود تا نمونه قدیمی هم‌زمان پخش نشود.

3. **Snapshot کامل Audio برای Draft/Final**
   - `ProjectAudioTrack` فقط `url/name` نباشد؛ `range`, `timeline`, `volume`, و برای پروژه `clipVolume/soundtrackMode` هم ذخیره شود.
   - هنگام Final Film و auto draft snapshot همین تنظیمات ذخیره شود.
   - هنگام Final→Draft، همان snapshot کامل برگردد، نه اینکه timeline/range از duration حدسی دوباره ساخته شود.

4. **Final Film audio بدون clipping**
   - در `mergeVideosWebCodecs.ts` بعد از offline mix، peak scan انجام شود.
   - اگر مجموع صدا از سقف عبور کرد، gain کل به شکل deterministic پایین آورده شود تا clipping/noise تولید نشود.
   - clip audio وقتی music/voiceover وجود دارد مثل تنظیم فعلی کاربر حفظ شود، اما از overload جلوگیری شود.

5. **Fallback قدیمی را هم امن نگه داریم**
   - در `mergeVideos.ts` gainها clamp شوند و مسیر live-recorder از ولوم‌های خارج از محدوده/overlap شدید نویز نسازد.
   - رفتار cloud/video generation/UI/auth/storage policies تغییر نمی‌کند.

6. **اعتبارسنجی بعد از پیاده‌سازی**
   - TypeScript باید clean باشد.
   - با Playwright در preview بررسی می‌کنم که فقط دو audio element وجود دارد، با Play/Pause صدای تکراری ساخته نمی‌شود، seek صدا را دوبل نمی‌کند، و Final→Draft دوباره music/voiceover را با تنظیمات درست نشان می‌دهد.
   - برای Final Film، مسیر encode را با یک پروژه دارای music + voiceover بررسی می‌کنم تا خروجی audio mix clipping نداشته باشد.

### فایل‌های محدود به تغییر
- `src/modules/generator-ui/components/PreviewSoundtrackWaveforms.tsx`
- `src/modules/generator-ui/pages/DashboardPage.tsx`
- `src/modules/generator-ui/lib/mergeVideosWebCodecs.ts`
- در صورت نیاز محدود: `src/modules/generator-ui/lib/mergeVideos.ts`

### چیزهایی که دست نمی‌زنم
- UI ساخت ویدئو/generation
- auth
- storage policies
- backend framework
- credit ledger
- مدل‌ها یا provider routing