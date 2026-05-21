## مشکل

پس از کلیک FINAL FILM، خروجی به‌درستی در Library ثبت می‌شود و کلیپ‌های ویدئویی منبع از طریق `projectSourceJobs[mergedId]` به پروژه‌ی Library نسبت داده می‌شوند، اما **عکس‌های منبع** هیچ‌گاه به `projectSourceImages[mergedId]` افزوده نمی‌شوند. نتیجه:

1. کارت عکس همچنان در Pending باقی می‌ماند (چون `displayedImages` فقط عکس‌هایی را که در `projectSourceImages` claim شده‌اند مخفی می‌کند — رفتار درست برای ویدئوهاست).
2. باز کردن کارت Final Film در Library تاریخچه‌ی عکس‌های منبع را نشان نمی‌دهد (پروژه‌ی خودش فاقد آن عکس‌هاست).

## تغییر

تک‌فایل: `src/modules/generator-ui/pages/DashboardPage.tsx` در بلوک ثبت Library پس از merge (حدود خط ۳۰۷۱–۳۰۸۲).

در کنار snapshot فعلی `sourceJobs` (ویدئوها به `projectSourceJobs`)، یک snapshot دوم اضافه می‌شود:

- از `eligibleClips` آیتم‌هایی با `kind === 'image'` فیلتر شوند و `.image` (یعنی `UserImageItem`) جمع شود.
- اگر طول > ۰ بود، `setProjectSourceImages({ ...projectSourceImages, [mergedId]: sourceImages })` و سپس `persistProjectSourceImages(next)` فراخوانی شود.

این کار باعث می‌شود:

- در `displayedImages` (خط ۱۴۲۰–۱۴۲۹) آن عکس‌ها داخل `claimedByProjects` قرار بگیرند و **از Pending حذف شوند**.
- در حالت انتخاب پروژه‌ی Final Film، snapshot عکس‌های منبع نمایش داده شود (همان‌طور که برای ویدئو کار می‌کند).

## خارج از اسکوپ

- بدون تغییر در حذف/upload عکس‌ها.
- بدون تغییر در DB، `mergeVideoUrls` یا کارت‌های ویدئو.
- Pending ویدئوها مطابق رفتار فعلی دست‌نخورده می‌ماند (فقط عکس‌ها claim می‌شوند — این هم‌راستا با اصل «Final Film source clips stay untouched» در کامنت موجود است؛ تنها برای عکس‌ها رفتار قبلی ناقص بوده).

## راستی‌آزمایی

- یک عکس آپلود + Final Film → کارت عکس از Pending حذف می‌شود؛ کارت Final Film در Library ظاهر می‌شود؛ باز کردن آن پروژه، عکس منبع را در HISTORY نشان می‌دهد.
- ترکیب عکس + ویدئو → هر دو نوع از Pending پاک شده و در پروژه‌ی Library قرار می‌گیرند.
- Reload → وضعیت پایدار است (به‌خاطر `persistProjectSourceImages`).
