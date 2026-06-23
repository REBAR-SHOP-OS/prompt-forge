# افزودن آیکون ترجمه به دیالوگ Voiceover

افزودن یک دکمه‌ی آیکونی **ترجمه** کنار دکمه‌های «Product narration» و «Regenerate» تا متن نریشن داخل فیلد TEXT به‌صورت دقیق به زبان انتخابی ترجمه شود.

## نکته
- edge function آماده‌ی `translate-text` از قبل وجود دارد و زبان‌های Persian, English, Arabic, Turkish, Spanish, French, German, Russian, Chinese را پشتیبانی می‌کند. نیازی به تغییر بک‌اند نیست.

## تغییرات — فقط `src/modules/generator-ui/components/VoiceoverDialog.tsx`

- import آیکون `Languages` از lucide-react.
- state جدید:
  - `isTranslateOpen` برای popover انتخاب زبان.
  - `isTranslating` برای حالت لودینگ.
- یک ثابت محلی `TRANSLATE_LANGS` با همان کدهای پشتیبانی‌شده‌ی edge function و نام بومی هر زبان (مثلاً `fa: فارسی`, `en: English`, `ar: العربية`, ...).
- تابع `handleTranslate(targetLang)`:
  - اگر `text.trim()` خالی باشد → toast هشدار.
  - فراخوانی `supabase.functions.invoke('translate-text', { body: { text, targetLang } })`.
  - در موفقیت: `setText(data.translation)` و بستن popover و toast موفقیت.
  - مدیریت خطا (۴۲۹/۴۰۲/سایر) با toast مناسب؛ مشابه الگوی موجود.
- **دکمه‌ی آیکونی ترجمه** کنار دکمه‌ی Regenerate (همان ناحیه‌ی دایره‌ای در تصویر) با آیکون `Languages`:
  - به‌صورت `PopoverTrigger`؛ کلیک → باز شدن لیست زبان‌ها.
  - هر زبان یک ردیف قابل کلیک که `handleTranslate` را صدا می‌زند.
  - در حال ترجمه، آیکون به اسپینر تبدیل و دکمه غیرفعال شود.
  - دارای `title`/`aria-label` («Translate narration»).
  - فقط زمانی فعال باشد که متنی در فیلد وجود دارد.

## بدون تغییر
- منطق TTS، انتخاب صدا، تولید نریشن و سایر بخش‌ها دست‌نخورده می‌ماند.

## اعتبارسنجی
- typecheck.
- تست `translate-text` با curl روی یک نمونه متن.
- بررسی بصری: تولید/داشتن متن، کلیک روی آیکون ترجمه، انتخاب زبان و جایگزینی متن ترجمه‌شده.
