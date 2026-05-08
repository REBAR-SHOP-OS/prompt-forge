## هدف
افزودن یک آیکون جدید در نوار بالای داشبورد (کنار START OVER / FINAL FILM / MUSIC) برای تبدیل متن به گفتار با استفاده از Google AI Studio (Gemini TTS).

## رفتار کاربر
1. کاربر روی آیکون جدید «Voiceover» کلیک می‌کند.
2. یک دیالوگ باز می‌شود شامل:
   - فیلد متن (Textarea) برای نوشتن متن دلخواه
   - انتخاب جنسیت: «Female» / «Male»
   - انتخاب لحن: Advertising / Excited / Calm / Narrative / Friendly / Serious
   - دکمه «Generate»
3. پس از تولید، پلیر صوتی نمایش داده می‌شود + دکمه‌های:
   - **Download** (دانلود فایل MP3/WAV)
   - **Use as soundtrack** (تنظیم به‌عنوان موزیک پس‌زمینه‌ی Final Film — همان جریان `musicUrl` موجود)

## معماری فنی

### Backend (Edge Function جدید)
`supabase/functions/tts-generate/index.ts`
- ورودی: `{ text, gender, tone }`
- نگاشت gender + tone → `voiceName` و `style instruction` برای Gemini TTS
  - مثلاً Female + Excited → voice `Kore` با prompt: `"Say excitedly and energetically: ..."`
  - Male + Advertising → voice `Puck` با prompt: `"Say in an upbeat advertising voice: ..."`
- فراخوانی Google AI Studio (مدل `gemini-2.5-flash-preview-tts`) با `GEMINI_API_KEY`
- خروجی PCM بازگشتی را به WAV تبدیل کرده و به‌صورت base64 برمی‌گرداند
- CORS کامل + هندل خطاهای 429/402

### Secret مورد نیاز
- `GEMINI_API_KEY` (کلید Google AI Studio) — قبل از پیاده‌سازی از کاربر درخواست می‌شود.

### Frontend
- یک کامپوننت جدید: `src/modules/generator-ui/components/VoiceoverDialog.tsx`
  - state: text, gender, tone, isGenerating, audioUrl
  - فراخوانی `supabase.functions.invoke('tts-generate', ...)`
  - پلیر `<audio controls>` + دکمه‌های Download و Use as soundtrack
- در `DashboardPage.tsx`:
  - افزودن state `isVoiceoverOpen`
  - افزودن یک دکمه نوار بالا با آیکون `Mic` (lucide) دقیقاً با همان استایل دکمه‌های Final Film/Music، بعد از دکمه Music
  - رندر کامپوننت `VoiceoverDialog`
  - callback `onUseAsSoundtrack(blobUrl, name)` → ست کردن همان state موزیکی که الان وجود دارد (`musicUrl`, `musicName`, `musicRange`) تا در Final Film استفاده شود

## فایل‌های تغییر یافته/ایجاد شده
- ایجاد `supabase/functions/tts-generate/index.ts`
- ایجاد `src/modules/generator-ui/components/VoiceoverDialog.tsx`
- ویرایش `src/modules/generator-ui/pages/DashboardPage.tsx` (افزودن دکمه نوار بالا + state + اتصال به سیستم music موجود)

## خارج از محدوده
- ذخیره دائمی صداهای تولید شده در دیتابیس
- صداگذاری روی هر کلیپ به‌صورت جداگانه (فعلاً فقط به‌عنوان soundtrack کلی Final Film)
- Voice cloning یا آپلود نمونه‌ی صوتی
