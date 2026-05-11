## هدف

1. حذف متن «/ تقویم تبلیغاتی» از عنوان دیالوگ — فقط `Marketing Calendar` بماند.
2. اضافه کردن یک آیکون **Languages** (lucide-react) در کنار تاریخ بالای پنل راست. با کلیک روی آن، محتوای پنل پایین بین **English** و **فارسی** toggle شود.
3. (اصلاح جانبی) محتوای دیالوگ در اسکرین‌شات هنوز قالب قدیمی (Overview/Historical/Birthdays) را نشان می‌دهد چون در state کش شده. این به‌خاطر تغییر پرامپت backend است؛ نیاز به re-deploy edge function تا محتوای جدید (مناسبت‌های تبلیغاتی) دریافت شود.

## تغییرات Backend

### `supabase/functions/day-info/index.ts`
- پذیرش پارامتر اختیاری `lang: 'en' | 'fa'` در body (پیش‌فرض `'en'`).
- اگر `lang === 'fa'`: همان system prompt مناسبت‌های تبلیغاتی، اما خروجی **به‌طور کامل به زبان فارسی روان** (بدون متن انگلیسی، بدون italic). ساختار همان (Occasion / What it is / Audience / Campaign Ideas / Hashtags) ولی برچسب‌ها فارسی: «معرفی»، «مخاطب»، «ایده‌های کمپین»، «هشتگ‌ها». هشتگ‌ها به فارسی یا انگلیسی هرکدام مرسوم‌تر است.
- اگر `lang === 'en'`: خروجی فقط انگلیسی، تک‌زبانه (نسخه دو زبانه قبلی حذف می‌شود تا toggle معنی‌دار باشد).
- نیاز به deploy مجدد edge function.

## تغییرات Frontend

### `src/modules/generator-ui/components/CalendarInfoDialog.tsx`
- حذف `<span dir="rtl">/ تقویم تبلیغاتی</span>` از `DialogTitle`.
- state جدید: `const [lang, setLang] = useState<'en' | 'fa'>('en')`.
- تغییر کلید cache از `dateKey` به ``${dateKey}:${lang}`` تا هر زبان جداگانه ذخیره شود.
- اضافه کردن دکمه آیکون `Languages` (lucide-react) در نوار تاریخ بالای پنل راست (سمت چپ آیکون close فعلی نه — همان نوار `longLabel`). دکمه:
  - `aria-label="Toggle Persian translation"`
  - متن کوچک کنار آیکون: `EN` یا `فا` بسته به zaban فعلی (نه، فقط آیکون با tooltip ساده تا تمیز بماند). آیکون رنگ amber اگر فارسی فعال باشد.
- با کلیک: `setLang(l => l === 'en' ? 'fa' : 'en')`. useEffect موجود به‌خاطر تغییر کلید cache مجدداً fetch می‌کند.
- در render محتوا، `dir="auto"` نگه داشته می‌شود تا فارسی راست‌چین شود.
- حذف کلاس‌های `prose-em:*` و `[&_em]:block` (دیگر نیازی به italic block برای ترجمه inline نیست).

## خارج از scope
- بدون تغییر آیکون اصلی تقویم در DashboardPage.
- بدون پاک کردن cache قدیمی به‌صورت دستی — کلید جدید (`:en`/`:fa`) به‌طور طبیعی کش قدیمی را دور می‌زند.
- بدون تغییر در منطق fetch، error handling، یا 429/402.

## تأیید
- عنوان دیالوگ فقط `Marketing Calendar`.
- آیکون زبان در نوار تاریخ دیده می‌شود.
- کلیک روی آیکون → محتوای پنل بین انگلیسی و فارسی روان جابجا می‌شود (با loader هنگام fetch زبان جدید).
- محتوای انگلیسی شامل بخش‌های قدیمی (Overview / Historical / Birthdays) نباشد — فقط مناسبت‌های تبلیغاتی + ایده کمپین.
