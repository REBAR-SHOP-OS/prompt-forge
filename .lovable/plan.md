هدف: وقتی کاربر روی «Reopen for editing» می‌زند، Final Film به Draft برگردد بدون اینکه موزیک/voiceover از خود فیلم، preview، یا Final Film بعدی حذف شود.

محدوده‌ی اصلاح:
1. مسیر `reopenFinalAsDraft` را اصلاح می‌کنم تا صدا فقط به‌صورت metadata/chip منتقل نشود، بلکه به state اجرایی موزیک و voiceover هم کامل restore شود.
2. برای restore صدا، range و timeline را معتبر می‌کنم:
   - اگر duration فایل صوتی بعداً load شد، `musicRange` و `voiceoverRange` به بازه‌ی واقعی فایل تنظیم شوند.
   - اگر طول فیلم هنوز آماده نبود، timeline به بازه‌ی امن و قابل پخش تنظیم شود و بعد از مشخص شدن طول draft اصلاح شود.
3. اگر audio mapping روی `finalId` نبود ولی روی `draftId` یا active state موجود بود، fallback امن اضافه می‌کنم تا صدا از دست نرود.
4. جلوی حالت خطرناک را می‌گیرم: chip صدا نمایش داده شود ولی `musicRange=[0,0]` یا timeline نامعتبر باشد؛ چون در این حالت preview و merge صدا را اعمال نمی‌کنند.
5. مسیر Final Film را دست نمی‌زنم جز همان ورودی‌های صدا؛ UI، auth، storage policy، credit، و backend framework تغییر نمی‌کند.

علت احتمالی باگ:
- صدا در `projectAudio` وجود دارد و به همین دلیل chip بالای preview دیده می‌شود.
- اما هنگام reopen، `musicUrl/voiceoverUrl` بدون range/timeline معتبر restore می‌شوند.
- merge/export فقط وقتی موزیک را اعمال می‌کند که `musicRange[1] > musicRange[0]` باشد؛ پس صدای قابل مشاهده، عملاً وارد preview/final render نمی‌شود.

جزئیات فنی:
- فایل اصلی: `src/modules/generator-ui/pages/DashboardPage.tsx`
- اصلاح روی این نقاط:
  - `reopenFinalAsDraft(...)`
  - `restoreDraftAudio(...)`
  - در صورت نیاز یک effect کوچک برای normalize کردن timeline بعد از تغییر `mergedDurationSec`
- از مسیر ذخیره‌سازی فعلی استفاده می‌شود؛ صدا کپی/حذف غیرضروری نمی‌شود.
- mapping صدا به شکل atomic از `finalId` به `draftId` منتقل و persist می‌شود.

چک تست بعد از اجرا:
1. یک Final Film با music و voiceover بسازید.
2. از Library روی آیکون Reopen for editing کلیک کنید.
3. بررسی کنید chipهای music و voiceover بالای preview هنوز هستند.
4. preview را play کنید؛ موزیک و voiceover باید روی همان Draft شنیده شوند.
5. دوباره Final Film بزنید؛ فایل خروجی باید همان صداها را داشته باشد.
6. صفحه را refresh کنید و draft را باز کنید؛ صدا نباید حذف شده باشد.

ریسک‌ها:
- کم؛ تغییر فقط restore/normalize صدای draft است.
- هیچ تغییر backend یا policy لازم نیست.