## هدف
تقویم فقط مناسبت‌های مهم زیر را نمایش دهد و بقیه فیلتر شوند:
- مناسبت‌های ملی/رسمی **کانادا** (تعطیلات فدرال و استانی شناخته‌شده)
- مناسبت‌های **بین‌المللی مهم** (روزهای رسمی سازمان ملل/یونسکو، روزهای جهانی پر‌مخاطب مانند Earth Day، Women's Day، Mother's Day، Valentine's Day، Halloween، Christmas، New Year و …)
- مناسبت‌های مهم **ادیان مختلف** (مسیحیت: Christmas، Easter، Good Friday، Lent…؛ اسلام: عید فطر، عید قربان، رمضان، عاشورا، مولد النبی…؛ یهودیت: Hanukkah، Yom Kippur، Rosh Hashanah، Passover…؛ هندوئیسم: Diwali، Holi…؛ بودیسم: Vesak…؛ سیک: Vaisakhi و …)

سایر مناسبت‌ها (روزهای محلی کم‌اهمیت، روزهای سرگرمی مثل "National Eat What You Want Day"، روزهای آگاهی‌بخش غیر‌رسمی، روزهای کشورهای دیگر) **نباید** نمایش داده شوند.

## تغییرات

### 1) `supabase/functions/day-info/index.ts`
بازنویسی `baseRules` در system prompt با قواعد سخت‌گیرانهٔ زیر:

- **Whitelist دسته‌ها** — فقط این موارد را برگردان:
  1. **Canadian holidays/observances**: تعطیلات فدرال (Canada Day, Victoria Day, Thanksgiving CA, Remembrance Day, Labour Day, Family Day, Civic Holiday, Truth and Reconciliation Day…) و تعطیلات رسمی استانی شناخته‌شده.
  2. **Major international days**: روزهای رسمی اعلام‌شدهٔ UN/UNESCO/WHO و روزهای جهانی با شناخت گسترده (Earth Day, International Women's Day, World Health Day, Human Rights Day, …).
  3. **Major religious holidays** از ادیان اصلی: مسیحیت، اسلام، یهودیت، هندوئیسم، بودیسم، سیک. تاریخ‌های متغیر (Easter، Eid، Diwali، …) باید بر اساس سال میلادی همان روز محاسبه شوند.

- **Blacklist صریح** — این موارد را برنگردان:
  - "National ___ Day" های آمریکایی سرگرمی/غذایی (Eat What You Want Day، National Pizza Day و …)
  - تعطیلات ملی کشورهای دیگر (غیر کانادا)، مگر اینکه بین‌المللی شده باشند
  - روزهای آگاهی‌بخش محلی، تبلیغاتی، یا برند-محور
  - تولد/درگذشت اشخاص (مگر اینکه روز رسماً به نام آن‌ها نام‌گذاری شده باشد و در دستهٔ ۱–۳ بگنجد)

- اگر روز هیچ مناسبتی در سه دستهٔ مجاز ندارد → آرایهٔ خالی برگردان (هیچ ابداعی).
- ساختار خروجی (`title`, `whatItIs`, `history`) و پشتیبانی زبان (en/fa) بدون تغییر.
- در `description` فیلد `title` در schema، یادداشت اضافه شود که نام مناسبت باید با مرجع رسمی‌اش مطابقت داشته باشد.
- توصیه می‌شود برای دقت بهتر در فیلترینگ، مدل از `google/gemini-3-flash-preview` به `google/gemini-2.5-pro` تغییر کند (دقت بالاتر در رعایت whitelist/blacklist و تاریخ‌های دینی متغیر). در صورت نگرانی هزینه، همان flash باقی بماند.

### 2) `src/modules/generator-ui/components/CalendarInfoDialog.tsx`
- عنوان دیالوگ از "Marketing Calendar" به **"Calendar"** تغییر کند (هماهنگ با محتوای جدید).
- متن خالی (`empty`) دقیق‌تر شود: EN: "No major holiday on this day." / FA: "مناسبت مهمی برای این روز ثبت نشده است."
- کش (`cache`) به‌خاطر تغییر prompt باید با کلید نسخه (مثلاً `v2:${dateKey}:${lang}`) بازنشانی شود تا نتایج قدیمی نمایش داده نشوند.

## خارج از scope
- چیدمان UI، آیکون‌ها، یا منطق انتخاب تاریخ.
- افزودن دیتابیس مناسبت‌های ثابت (همچنان مدل AI پاسخ می‌دهد، فقط با قواعد سخت‌گیرانه‌تر).
- نمایش پرچم/دسته‌بندی بصری مناسبت‌ها (مثلاً برچسب «دینی» یا «کانادا») — در صورت تمایل می‌توانیم در فاز بعدی اضافه کنیم.
