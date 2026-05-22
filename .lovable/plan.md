## هدف
کاربر می‌خواهد بعد از تولید voiceover، فایل صوتی ساخته‌شده را به‌راحتی دانلود کند.

## وضعیت فعلی
در `src/modules/generator-ui/components/VoiceoverDialog.tsx` دکمه Download وجود دارد ولی داخل یک پنل کوچک کنار پلیر صوتی است و چندان واضح نیست. در فوتر دیالوگ فقط دکمه Close هست.

## تغییر
فقط در فایل `VoiceoverDialog.tsx`:

1. دکمه **Download** را به فوتر دیالوگ (کنار Close) منتقل/اضافه می‌کنیم تا همیشه در دسترس و واضح باشد.
2. وقتی `audioUrl` وجود نداشته باشد، دکمه disabled است؛ بعد از تولید فعال می‌شود.
3. دکمه قبلی Download داخل پنل پلیر حذف می‌شود (برای جلوگیری از تکرار). دکمه "Use as soundtrack" در همان پنل باقی می‌ماند.
4. نام فایل دانلود بر اساس voice/tone خواناتر می‌شود: مثل `voiceover-female-excited-<timestamp>.wav`.

## خارج از scope
- بدون تغییر edge function `tts-generate`.
- بدون تغییر backend/storage.
- بدون تغییر سایر بخش‌های UI داشبورد.