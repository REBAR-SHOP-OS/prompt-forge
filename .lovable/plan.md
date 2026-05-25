
# هدف

درفت‌ها هرگز نباید فیلم خود را از دست بدهند. تنها دو راه برای پاک شدن یک درفت یا کلیپ‌های آن مجاز است:

1. کاربر خودش درفت/کلیپ را Delete کند.
2. کاربر روی Final Film بزند → درفت به عنوان Final Video ثبت شود.

در حال حاضر در اسکرین‌شات کاربر، یک درفت ("EXT. DIRT FIELD - DAWN — 2 CLIPS") بدون تامبنیل و با پیام "Video unavailable" نمایش داده می‌شود. علت این است که سیستم در چند نقطه، کلیپ‌های زیرین یک درفت را به‌صورت ناخواسته از workspace یا state حذف می‌کند، در حالی که snapshot درفت همچنان به یک storage_path زنده‌بمانده‌ی ناقص اشاره می‌کند.

# ریشه‌ی مشکل (در کد فعلی)

تنها به فایل `src/modules/generator-ui/pages/DashboardPage.tsx` مربوط است. سه مسیر باعث «گم شدن فیلم درفت» می‌شوند:

1. **حذف خودکار در polling** — وقتی `getJob` خطای "missing" برمی‌گرداند (مثلاً وقفه‌ی موقت سرور یا اشتباه در شناسایی)، کلیپ از `generatedVideos` پاک می‌شود (خط ~۲۵۴۳). اگر draft snapshot هنوز همان کلیپ را داشته باشد، رفرنس به storage_path در snapshot باقی می‌ماند ولی جابی DB دیگر نیست؛ بعد از رفرش، snapshot دوباره ساخته نمی‌شود.
2. **«Source files missing on server» در Final Film** (خط ~۳۶۵۵) — کلیپ‌ها به `workspaceHiddenJobIds` اضافه می‌شوند و چون effect خط ۱۶۲۶ فقط کلیپ‌های نا-hidden را در درفت می‌گذارد، snapshot درفت فعال خالی می‌شود.
3. **Stub بدون storage_path** — در ساخت `entry.video` در خط ۱۶۷۳، اگر `firstClip.video` وجود داشته باشد اما `storage_path` آن خالی/expired باشد، تامبنیل کارت همان dead URL را می‌گیرد و PlayableVideo "Video unavailable" نشان می‌دهد. در ضمن وقتی فقط image وجود دارد، `storage_path` به مسیر تصویر اشاره می‌کند که برای تگ `<video>` معتبر نیست.

# تغییرات

تمام تغییرات در `src/modules/generator-ui/pages/DashboardPage.tsx` (یک فایل) و در `src/modules/generator-ui/components/PlayableVideo.tsx` (یک تغییر کوچک برای استفاده‌ی thumbnail) انجام می‌شود. **هیچ تغییری در DB، edge function، schema یا storage لازم نیست** — کلیپ‌های واقعی پیش‌تر به باکت `merged-videos` آپلود می‌شوند، فقط حفاظت client-side ناکافی است.

## ۱) قانون تغییرناپذیر: درفت‌ها فقط با کنش صریح کاربر پاک می‌شوند

یک helper جدید `isDraftProtected(jobId)` اضافه می‌شود. هر مسیری که کلیپ‌ها/تصاویر را از state حذف یا hidden می‌کند، اول چک می‌کند آیا آن id در `draftSourceJobs`/`draftSourceImages` هیچ درفتی هست یا نه. اگر بله:

- در poll loop (خط ۲۵۳۳-۲۵۴۵): کلیپ‌های `missingJobIds` که به یک درفت تعلق دارند، **از لیست حذف نمی‌شوند**؛ به‌جای آن یک شمارنده‌ی failure در `Ref` نگه داشته می‌شود و کلیپ فقط بعد از N تلاش پیاپی **و** عدم وجود در هیچ درفتی پاک می‌شود.
- در شناسایی broken clip در Final Film (خط ۳۶۵۸-۳۶۶۴): اگر کلیپ متعلق به درفت فعال باشد، فقط از این run خاصِ Final Film کنار گذاشته می‌شود (`workspaceHiddenJobIds` set نمی‌شود) تا snapshot درفت دست‌نخورده بماند و کاربر بتواند regenerate کند.
- Start Over (هر جا که `workspaceHiddenJobIds` را set می‌کند) رفتار فعلی‌اش حفظ می‌شود چون اصلاً قرار است درفت ایجاد کند، نه پاک کند.

## ۲) Snapshot درفت همیشه storage_path معتبر دارد

در effect خط ۱۶۱۴-۱۶۹۸:

- قبل از قرار دادن کلیپ در `draftSourceJobs`، اگر `clip.video?.storage_path` خالی یا تنها یک aliyun/expired URL است، آن کلیپ در snapshot قرار نمی‌گیرد (در snapshot قبلی باقی می‌ماند). با این روش، نسخه‌ی persisted روی Supabase storage هرگز با یک URL ephemeral overwrite نمی‌شود.
- در ساخت `entry.video` (stubVideo)، اگر فقط image داریم، `storage_path` همان image می‌شود اما یک فلگ جدید `kind: 'image'` به آن stub اضافه می‌شود (در یک `Map<jobId, 'image'|'video'>` که کنار snapshot نگه‌داری می‌شود). در render کارت (خط ۵۶۲۶-۵۶۴۹) اگر `kind === 'image'` بود به‌جای `<PlayableVideo>` از `<img>` استفاده می‌شود.
- اگر `firstClip.video.thumbnail_url` موجود باشد، آن به‌عنوان `poster` به PlayableVideo داده می‌شود (همین الان داده می‌شود) تا حتی هنگام resolve شدنِ video، یک تصویر دائمی دیده شود به‌جای پیغام خطا.

## ۳) بازیابی هنگام رفرش: draft entries همیشه از snapshot ساخته می‌شوند

تنها منبع حقیقت برای رندر کارت درفت، `draftEntries` در localStorage است (در حال حاضر همین است). تغییر:

- effect خط ۱۷۰۷-۱۸۰۰ (backfill historical drafts) که شرط `if (!workspaceHiddenJobIds.has(job.id)) continue` دارد، تغییر می‌کند: کلیپ‌هایی که در `draftSourceJobs` هستند ولی دیگر در `generatedVideos` نیستند نیز یک کارت درفت برایشان بازسازی می‌شود (تا اگر پولینگ یا سرور موقتاً کلیپ را گم کرد، کارت باقی بماند).
- در `deleteCard` (خط ۱۲۵۸+) رفتار فعلی برای درفت‌ها (delete صریح کاربر) دست‌نخورده می‌ماند — این تنها مسیر مجاز پاک شدن است.

## ۴) Fallback بصری در PlayableVideo

تغییر کوچک در `PlayableVideo.tsx`:

- اگر `errored` و `poster` موجود است، به‌جای پیغام "Video unavailable" خود poster را به‌عنوان `<img>` نمایش بدهد. این کار باعث می‌شود حتی اگر یک بار stream خراب باشد، کاربر همچنان تامبنیل کلیپ خود را ببیند و درفت "ناپدید" به نظر نرسد. روی پلی شدن واقعی هم اثری ندارد چون فقط fallback است.

# جزئیات فنی (برای reviewer)

- فایل‌های لمس‌شده: `src/modules/generator-ui/pages/DashboardPage.tsx`, `src/modules/generator-ui/components/PlayableVideo.tsx`.
- بدون migration، بدون edge function جدید، بدون secret جدید.
- اضافه شدن `draftKindMap` به‌صورت یک state سبک + persist در localStorage (مشابه snapshotهای موجود).
- شمارنده‌ی missing-job per id با `useRef<Record<string, number>>`؛ آستانه = ۵ تلاش پیاپی و فقط برای جاب‌های **غیر درفت**.
- بدون تغییر در رفتار Final Film موفق (کلیپ‌ها همچنان به Final تبدیل می‌شوند و درفت پاک می‌شود — این تنها مسیر مجاز دوم برای پاک شدن درفت است).
- بدون تغییر در نحوه‌ی نمایش پنل Pending سمت راست (آن از همان `draftSourceJobs[activeDraftId]` می‌خواند که حالا پایدارتر است).

# Test checklist

1. یک ویدئوی جدید بساز → کارت آن در Pending سمت راست و در LIBRARY → DRAFTS با thumbnail پدیدار شود.
2. صفحه را رفرش کن → کارت درفت با همان thumbnail باقی بماند، نه "Video unavailable".
3. اینترنت را برای ۳۰ ثانیه قطع کن (یا سرور Supabase را disable کن) سپس وصل کن → کارت درفت پاک نشده باشد.
4. Final Film بزن → کارت درفت به Final تبدیل شود و درفت ناپدید شود (مسیر مجاز).
5. روی آیکن سطل‌زباله‌ی یک کارت درفت بزن → تأیید بخواهد، سپس پاک شود (مسیر مجاز).
6. در یک درفت با ۲ کلیپ، یک کلیپ را قبل از Final Film عمداً «گم» کن (مثلاً با باز کردن DevTools و delete کردن row در DB دستی) → کارت درفت همچنان باقی بماند با poster، و Final Film پیام بدهد که regenerate کن (بدون پاک کردن snapshot).
