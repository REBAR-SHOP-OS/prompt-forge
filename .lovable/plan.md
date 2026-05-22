## مشکل ریشه‌ای

وقتی روی یک پروژه‌ی Library کلیک می‌شود، کارت‌های منبع از snapshot ذخیره‌شده در `projectSourceJobs[selectedProjectId]` خوانده می‌شوند. اما `storage_path` این snapshot همان URL پراویدر (DashScope / Veo / Flow) است که **signed URL با عمر محدود** دارد. بعد از چند ساعت/روز این URLها منقضی می‌شوند، در نتیجه پلیر کارت سیاه می‌ماند («0:00» در اسکرین‌شات همین است). proxy edge function هم مشکل را حل نمی‌کند چون فقط همان URL منقضی‌شده را دوباره از پراویدر می‌خواند.

برای کلیپ‌هایی که هنوز در `generatedVideos` زنده‌اند، `displayedVideos` از داده‌ی زنده استفاده می‌کند؛ ولی به‌محض اینکه Final Film ذخیره می‌شود و workspace پاک می‌شود، تنها مرجع همان snapshot منقضی است.

## راه‌حل (هزینه‌ی کم، یک‌بار، در زمان ساخت Final Film)

در همان نقطه‌ای که Final Film موفق ذخیره می‌شود (تابع merge در `DashboardPage.tsx`، حوالی خط ۳۱۸۳ قبل از `setProjectSourceJobs`)، برای هر کلیپ ویدئویی منبع که `storage_path` آن **روی هاست خودمان (`MERGED_BUCKET`/`*.supabase.co`) نیست**:

1. بایت‌های ویدئو از طریق `proxiedVideoUrl(...)` + `fetch` گرفته می‌شوند.
2. روی `MERGED_BUCKET` با path پایدار مثل `${userId}/source-snapshot-${jobId}.{ext}` آپلود می‌شود.
3. در snapshot‌ای که در `projectSourceJobs` نوشته می‌شود، `storage_path` با URL عمومی جدید جایگزین می‌شود.

نتیجه: بعد از این، هر بار کاربر پروژه را در Library باز کند، کارت‌ها از یک URL پایدار خوانده می‌شوند و همیشه قابل پخش هستند.

اگر دانلود/آپلود برای یک کلیپ شکست خورد، آن کلیپ با همان URL اصلی snapshot می‌شود (degradation امن، رفتار فعلی).

## محدودیت دامنه

- فقط `src/modules/generator-ui/pages/DashboardPage.tsx` تغییر می‌کند.
- هیچ migration یا تغییر backend / RLS لازم نیست (از همان bucket فعلی `MERGED_BUCKET` که قبلاً برای Final Film استفاده می‌شود استفاده می‌کنیم).
- تصاویر منبع (`projectSourceImages`) از قبل در `generator_user_images` / Supabase storage پایدار هستند و نیاز به تغییر ندارند.
- پروژه‌های Library قدیمی که snapshot منقضی دارند با باز کردن دوباره + ساخت Final Film جدید فقط به‌مرور درمان می‌شوند. (برای آن‌ها در همان لحظه‌ی باز شدن نمی‌توان کاری کرد چون URL پراویدر دیگر کار نمی‌کند.)

## ریسک

- زمان ذخیره‌ی Final Film کمی طولانی‌تر می‌شود (یک fetch + upload به ازای هر کلیپ منبع). با Promise.all موازی می‌شود.
- مصرف storage افزایش پیدا می‌کند (هر کلیپ یک‌بار کپی پایدار می‌گیرد). قابل قبول است چون Final Film هم در همان bucket ذخیره می‌شود.
- اگر کاربر اینترنت قطع شود وسط آپلود snapshot، fallback روی URL اصلی برمی‌گردد و رفتار قبلی حفظ می‌شود.
