## هدف
وقتی کاربر روی **Start Over** کلیک می‌کند، کارت‌های پنل **Library** (که خروجی‌های نهایی Final Film هستند) تحت هیچ شرایطی نباید حذف شوند. فقط workspace کاری (composer، history کارت‌های در حال ساخت، transitions، ادیت‌ها، music، تب FINAL FILM فعلی در preview) ریست شود.

## وضعیت فعلی (رفتار اشتباه)
در `handleStartOver` این کارها انجام می‌شود:
- `setMergedEntries([])` — تب Final Film خالی می‌شود (این بخش OK است برای preview، اما همین entries منبع کارت‌های Library هم هستند)
- `setApprovedIds(new Set())` — Library عملاً خالی می‌شود
- پاک‌کردن فایل‌های `merged-videos` از storage — فایل‌های فیلم نهایی برای همیشه نابود می‌شوند

نتیجه: Library صفر می‌شود و فایل‌های Final Film از سرور حذف می‌شوند، که خلاف خواسته است.

## برنامهٔ اصلاح
1. **حفظ کامل Library در Start Over**
   - `setApprovedIds` و کلید `localStorage` مربوط به آن دست‌نخورده باقی بماند.
   - `mergedEntries` و persisted JSON آن دست‌نخورده باقی بماند، تا کارت‌های Final Film همچنان در Library و در تب FINAL FILM موجود باشند.
   - مرحلهٔ پاک‌سازی فایل‌های `merged-videos` از storage کاملاً حذف شود.

2. **بازنشانی فقط workspace کاری**
   - composer، prompt، uploadedFiles، transitions، manualOrder، editedClips، editedJobIds، pendingEnd/StartAppends، music، mergeProgress، lockedProjectRatio، previewVideoId مثل قبل ریست شوند.
   - اگر `previewVideoId` به یکی از mergedEntries اشاره دارد همان بماند تا کاربر روی فیلم نهایی نماند ولی Library را از دست ندهد (انتخاب: ریست به null برای تجربهٔ «شروع تازه»).

3. **تأیید سایر مسیرهای حذف**
   - تنها مسیر حذف کارت Library باید دکمهٔ Delete صریح روی همان کارت باشد، نه Start Over.

## فایل‌های درگیر
- `src/modules/generator-ui/pages/DashboardPage.tsx` — فقط داخل `handleStartOver`

## نتیجهٔ مورد انتظار
بعد از Start Over: composer و History پاک می‌شود، اما Library و فایل‌های فیلم نهایی روی سرور دست‌نخورده باقی می‌مانند.