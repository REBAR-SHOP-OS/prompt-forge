
# قاعده‌ی اصلی برنامه

**History = workspace موقت. Library = ذخیره‌گاه دائمی.**

ویدیوهای generate شده و عکس‌های آپلودی فقط برای ساختن Final Film وجود دارند. به محض اینکه Final Film با موفقیت ساخته شد، همه‌ی منابع History (jobها، video assets، عکس‌های آپلودی) به‌طور **دائمی** از سرور پاک می‌شوند و فقط فیلم merged در Library باقی می‌ماند.

# آیا الان این اتفاق می‌افتد؟

**خیر.** الان:
- وقتی ویدیو generate می‌شود → در `generator_generation_jobs` + `generator_video_assets` + storage ذخیره می‌شود (دائمی)
- وقتی عکس آپلود می‌شود → در `generator_user_images` + bucket `user-images` ذخیره می‌شود (دائمی)
- وقتی Final Film زده می‌شود → فقط فیلم merged به `merged-videos` آپلود می‌شود، اما **هیچ‌کدام از منابع پاک نمی‌شوند**

نتیجه: همه‌ی ویدیوها و عکس‌های قبلی روی سرور باقی می‌مانند و در device دیگر دوباره ظاهر می‌شوند — دقیقاً همان باگ.

# پلن اصلاح

## ۱. Server-side purge بعد از Final Film موفق

در تابع `handleMergeAllVideos` در `DashboardPage.tsx`، بعد از اینکه فیلم merged با موفقیت آپلود و در Library ثبت شد، یک مرحله‌ی purge اضافه می‌شود:

```text
Merge succeeds
   ↓
Upload merged.mp4 to merged-videos bucket
   ↓
Add to Library (approvedIds + mergedEntries)
   ↓
[NEW] Purge all source jobs from server   →  jobs-delete edge function
[NEW] Purge all uploaded images from server → images-delete edge function
   ↓
Clear generatedVideos + userImages from UI
```

استفاده از `Promise.allSettled` تا اگر یکی fail شد بقیه ادامه دهند. فایل‌های storage مرتبط با jobها و عکس‌ها هم پاک می‌شوند (همان مسیر `jobs-delete` و `images-delete` که قبلاً ساختیم).

## ۲. حفاظت‌های لازم

- **Atomic از دید کاربر**: Purge فقط بعد از تأیید آپلود موفق merged.mp4 اجرا شود. اگر merge fail شد، هیچ چیزی پاک نمی‌شود.
- **Library امن**: فیلم‌های قبلی Library (در `merged-videos` bucket) دست نخورده می‌مانند — فقط منابع History پاک می‌شوند.
- **Frame URLs**: اگر job ای از first/last frame استفاده می‌کرد، آن فریم‌ها در `wan-frames` bucket هستند — بررسی شود که آیا `jobs-delete` آن‌ها را هم پاک می‌کند یا نه.
- **In-flight jobs**: اگر jobای هنوز `processing` است و کاربر Final Film می‌زند، آن job purge نشود (یا کلاً Final Film تا تکمیل همه‌ی jobها disable باشد — که الان همین‌طور است).

## ۳. تغییرات کد

| فایل | تغییر |
|------|------|
| `src/modules/generator-ui/pages/DashboardPage.tsx` | افزودن مرحله‌ی purge در انتهای موفقیت‌آمیز `handleMergeAllVideos`؛ optimistic clear کردن `generatedVideos` و `userImages` بعد از purge |
| `supabase/functions/jobs-delete/index.ts` (در صورت نیاز) | اطمینان از پاک شدن first/last frame URLs از `wan-frames` bucket |

## ۴. خارج از اسکوپ این پلن (اما توصیه می‌شود بعداً)

- **Library فعلاً local-only است** (`merged-videos:<userId>` در localStorage). یعنی فیلم‌های Library هم در device دیگر دیده نمی‌شوند. این یک مسئله‌ی جداست. اگر می‌خواهید Library واقعاً cross-device باشد، باید یک جدول `library_films` ساخته شود. در پلن جدا.

# نتیجه

بعد از این تغییر:
- History کاملاً ephemeral است — فقط تا لحظه‌ی Final Film عمر دارد
- Final Film تنها مسیر «ذخیره» است
- هیچ ویدیو یا عکسی روی سرور باقی نمی‌ماند مگر اینکه بخشی از یک Library film شده باشد
- در device دیگر فقط Library films دیده می‌شوند، نه منابع History
