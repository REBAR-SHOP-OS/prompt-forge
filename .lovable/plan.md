نتیجه مورد انتظار: هیچ کارت رندری دیگر روی 92٪ مبهم نماند؛ هر Job فقط یکی از این وضعیت‌های قابل اتکا را نشان بدهد: در صف/در حال رندر با پیام واقعی، تکمیل‌شده، یا fail قطعی با برگشت اعتبار.

تشخیص دقیق فعلی:
- Job فعلی `95d369d8...` در دیتابیس هنوز `processing` است، نه completed/failed.
- `jobs-get` از backend برای همین Job فقط `progress_percent: 18` برمی‌گرداند، اما UI با تخمین زمان خودش آن را تا 92٪ بالا می‌برد.
- بنابراین مشکل فعلی «رندر واقعاً 92٪ نیست»؛ مشکل اصلی این است که frontend درصد مصنوعی 92٪ می‌سازد و حس freeze می‌دهد.
- لاگ backend نشان می‌دهد provider هنوز `processing` است و ویدیو نداده: `pollStatus=processing`, `pollProgress=18`, `hasVideo=false`.
- دیتابیس ستون persistent برای دلیل خطا/پیام وضعیت ندارد؛ پس بعد از refresh علت دقیق fail یا provider status پایدار ذخیره نمی‌شود.

محدودیت‌ها و چیزهایی که نباید خراب شوند:
- ساخت ویدیو، refund اعتبار، حذف کارت‌ها، Final Film و chain چند Scene نباید تغییر رفتار مخرب داشته باشند.
- فایل‌های auto-generated backend client/types دستکاری نمی‌شوند.
- تغییرات DB فقط با migration انجام می‌شود.
- هیچ Job نباید بی‌نهایت در `processing` بماند.

برنامه اصلاح:

1. حذف ریشه‌ای 92٪ مصنوعی از UI
- `DashboardPage.tsx` دیگر برای Jobهای در حال پردازش progress را تا 92٪ time-based بالا نمی‌برد.
- اگر provider درصد واقعی نمی‌دهد، UI به‌جای عدد نزدیک پایان، حالت مرحله‌ای نشان می‌دهد: queued / rendering / taking longer.
- برای این حالت، progress bar به سقف محافظه‌کارانه پایین‌تر محدود می‌شود یا به حالت “active rendering” تبدیل می‌شود تا کاربر فکر نکند ویدیو 92٪ آماده است.

2. تفکیک progress واقعی از progress تخمینی backend
- در backend، progress تخمینی Wan دیگر با `WAN_EXPECTED_RENDER_MS = 150s` تا 92٪ پرتاب نمی‌شود.
- اگر DashScope درصد واقعی نداده باشد، backend فقط وضعیت provider را گزارش می‌کند، نه درصد جعلی نزدیک 100.
- درصد 100 فقط وقتی برمی‌گردد که `video_url` واقعی دریافت و Job کامل شده باشد.

3. ذخیره وضعیت/دلیل پایدار در دیتابیس
- یک migration اضافه می‌شود برای ذخیره پیام وضعیت و آخرین وضعیت provider روی `generator_generation_jobs`.
- هنگام poll، backend آخرین وضعیت provider، progress واقعی اگر وجود داشت، و دلیل fail را ذخیره می‌کند.
- اگر Job fail شود، دلیل دقیق آن بعد از refresh هم قابل نمایش می‌ماند.

4. اصلاح timeout قطعی و deterministic
- timeout همچنان بر اساس duration محاسبه می‌شود، اما backend در هر `jobs-get` آن را enforce می‌کند.
- برای 15s، اگر از زمان مجاز عبور کند، Job همان‌جا `failed` می‌شود و credit refund می‌گیرد.
- پیام fail در خود Job ذخیره می‌شود، نه فقط transaction description.

5. جلوگیری از polling/race اضافی
- در frontend برای هر Job فقط یک `jobs-get` هم‌زمان مجاز می‌شود.
- اگر یک poll هنوز در جریان باشد، tick بعدی همان Job را دوباره نمی‌زند.
- این کار فشار روی backend/provider را کم می‌کند و وضعیت‌های متناقض کمتر تولید می‌شود.

6. اصلاح پیام Scene chaining
- وقتی 45s انتخاب شده و عملاً سه کلیپ 15s پشت‌سرهم ساخته می‌شود، UI واضح نشان می‌دهد که در حال انتظار برای Scene 1 است، نه اینکه کل پروژه روی 92٪ گیر کرده.
- اگر Scene fail شود، دلیل backend دقیقاً در پیام chain نشان داده می‌شود.

7. اعتبارسنجی بعد از اجرا
- با `jobs-get` روی همین Job بررسی می‌شود که دیگر UI/response به شکل مبهم 92٪ رفتار نکند.
- لاگ `jobs-get` بررسی می‌شود تا provider status، progress و timeout درست گزارش شوند.
- اگر Job از timeout عبور کرده باشد، باید به `failed` با refund تبدیل شود؛ اگر هنوز قانونی در حال پردازش باشد، باید پیام واقعی نشان دهد نه 92٪.

ریسک کم و کنترل‌شده:
- این تغییرات ساختار اصلی تولید ویدیو را عوض نمی‌کند؛ فقط وضعیت، progress، timeout و پیام‌دهی را deterministic و پایدار می‌کند.

بعد از تأیید شما، اول migration امن را می‌سازم، سپس کد frontend/backend را اصلاح و با همین Job فعلی تست می‌کنم.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>