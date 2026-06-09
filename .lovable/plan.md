# تکمیل پیش‌نمایش ویدئویی برای «صحنه» و «تمپلیت ویدئویی»

## وضعیت فعلی
- دسته‌های **دوربین (Camera)** و **ژانر (Genre)** پیش‌نمایش ویدئویی دارند (۱۸ کلیپ ساخته و وصل شده).
- دسته‌های **صحنه و محیط (Scene = ۲۰ مورد)** و **تمپلیت ویدئویی (Video Templates = ۳۳ مورد)** هنوز فقط کارت متنی نشان می‌دهند و کلیپ ندارند.

هدف: ساختن و وصل‌کردن کلیپ ویدئویی برای هر ۵۳ مورد باقیمانده تا همه‌ی سبک‌ها مثل بقیه پیش‌نمایش ویدئویی داشته باشند.

## محل تغییر
- `src/modules/generator-ui/components/ProductAdDialog.tsx` (افزودن importها و فیلد `preview`)
- پوشه‌ی `src/assets/style-previews/` (افزودن فایل‌های `.mp4.asset.json`)

## روش
برای هر مورد یک کلیپ کوتاه ۵ ثانیه‌ای بی‌صدا و لوپ‌شونده با ابعاد 16:9 ساخته می‌شود (با همان الگوی قبلی: تولید ویدئو → آپلود به‌صورت asset → import به‌صورت `.mp4.asset.json`). prompt هر کلیپ از روی توضیح همان سبک در آرایه ساخته می‌شود.

### فاز ۴ — صحنه و محیط (۲۰ کلیپ)
ساخت کلیپ برای: construction-site, heavy-industry, abandoned-warehouse, shipyard-dock, high-tech-lab, megacity-corporate, cyberpunk-alleyway, subway-station, rooftop-overlook, epic-mountain, apocalyptic-wasteland, mystical-forest, arctic-tundra, medieval-castle, ancient-ruins, gothic-cathedral, steampunk-workshop, jazz-club, dark-academia-library, retro-diner.
سپس افزودن فیلد `preview` به هر آیتم در `SCENE_TEMPLATES`.

### فاز ۵ — تمپلیت ویدئویی (۳۳ کلیپ)
ساخت کلیپ برای همه‌ی آیتم‌های `VIDEO_TEMPLATES` (Sports, Animation, Social, Corporate, Cinematic, Events, Explainer) و افزودن فیلد `preview` به هر کدام.

### اتصال در UI
کارت‌های Scene و Video Templates از قبل با `StylePreviewCard` پیچیده شده‌اند؛ به‌محض پرشدن فیلد `preview`، ویدئو روی hover پخش می‌شود. نیازی به تغییر ساختار UI نیست.

## نکته‌ی مهم درباره‌ی حجم
۵۳ کلیپ ویدئویی تعداد زیادی است و تولید آن زمان‌بر و پرهزینه است. تولید در چند مرحله (بَچ) انجام می‌شود و بین مراحل وضعیت بررسی می‌شود. اگر ترجیح بدهید می‌توان به‌جای ۵۳ ویدئوی مجزا، تعداد کمتری کلیپ نماینده برای هر زیرگروه ساخت و به اعضای آن گروه نسبت داد تا حجم و هزینه کمتر شود.

## تأیید نهایی
پس از اتمام، با hover روی هر سبک در بخش‌های «صحنه» و «تمپلیت ویدئویی» یک کلیپ ویدئویی لوپ‌شونده دیده می‌شود — مشابه دوربین و ژانر.
