## هدف
کارگاه فعال (chain فعلی از کلیپ‌ها + تصاویر) به‌صورت خودکار به عنوان یک **پروژه‌ی Draft** در Library ذخیره شود و در تمام سناریوها زنده بماند:
- در حال ساخت (هر بار کلیپ یا تصویر اضافه/حذف شود)
- بعد از refresh صفحه
- بعد از Start Over
- اگر کاربر روی Final Film بزند → از Drafts خارج می‌شود و به Final videos منتقل می‌شود

## محدوده
فقط `src/modules/generator-ui/pages/DashboardPage.tsx`. بدون backend / migration. ذخیره‌سازی روی localStorage مثل بقیه‌ی state ها.

## مدل داده

### state جدید
- `draftEntries: JobDetail[]` — لیست پروژه‌های Draft (مشابه `mergedEntries`). هر draft یک JobDetail مصنوعی است با `id = draft-<uuid>`, `input_prompt = اولین prompt در chain`, `created_at` ثابت، `updated_at` با هر تغییر. فیلد `video` به‌صورت stub با `thumbnail_url` و `storage_path` کلیپ اول پر می‌شود تا کارت preview نشان دهد (دانلود برای drafts غیرفعال است).
- `activeDraftId: string | null` — id همان draft فعال این جلسه‌ی کاری.
- هر دو در localStorage:
  - `draft-entries:${userId}`
  - `active-draft-id:${userId}`

### بازاستفاده از زیرساخت موجود
snapshot کلیپ‌ها/تصاویر هر draft روی همان ساختار فعلی `projectSourceJobs[draftId]` و `projectSourceImages[draftId]` نوشته می‌شود. این یعنی کلیک روی کارت draft → `setSelectedProjectId(draftId)` و HISTORY/درست کارت‌ها همان منطق فعلی پروژه را اجرا می‌کند، بدون کد جدید.

## منطق auto-snapshot (useEffect)

ورودی‌ها: `generatedVideos`, `userImages`, `workspaceHiddenJobIds`, `workspaceHiddenImageIds`, `projectSourceJobs`, `mergedEntries`.

محاسبه‌ی **workspace زنده**:
- کلیپ‌هایی از `generatedVideos` که `workspaceHiddenJobIds` نیستند و در snapshot هیچ پروژه‌ی Library/draft دیگر claim نشده‌اند.
- تصاویر مشابه با `workspaceHiddenImageIds`.

سپس:
- اگر workspace خالی است → هیچ کاری نکن (draft قبلی همان‌جا می‌ماند).
- اگر workspace ≥ ۱ آیتم دارد:
  - اگر `activeDraftId` null است → `activeDraftId = 'draft-<uuid>'` بساز و persist کن.
  - یک ورودی برای `draftEntries[activeDraftId]` بنویس/به‌روزرسانی کن: prompt اولین کلیپ/تصویر، `updated_at = now`, `created_at` فقط در اولین بار، stub video از اولین کلیپ یا تصویر برای thumbnail.
  - `projectSourceJobs[activeDraftId] = workspaceClips` و `projectSourceImages[activeDraftId] = workspaceImages`.

## نقاط ترکیب با جریان موجود

### Final Film موفق (حوالی خط ۳۲۳۹ بعد از saved projectSourceJobs)
اگر `activeDraftId` ست است:
- ورودی متناظر از `draftEntries` حذف می‌شود.
- snapshotهای `projectSourceJobs[activeDraftId]` و `projectSourceImages[activeDraftId]` پاک می‌شوند (چون حالا روی `mergedId` ذخیره شده‌اند).
- `activeDraftId = null`.
نتیجه: پروژه از Drafts به Final videos منتقل می‌شود.

### Start Over (`handleStartOver` خط ۳۳۵۶)
- قبل از `resetWorkspace`: snapshot نهایی draft گرفته می‌شود تا چیزی از دست نرود (effect خودش این کار را می‌کند، فقط مطمئن می‌شویم state آپدیت قبل از hide ها flush شود — می‌توان مستقیماً اینجا snapshot کرد).
- نکته‌ی مهم: محاسبه‌ی `claimedJobIds`/`claimedImageIds` باید **به draft snapshot هم نگاه کند** تا Start Over کلیپ‌های داخل draft را روی سرور حذف نکند (همان رفتار محافظت Library projects).
- در پایان: `activeDraftId = null` تا چرخه‌ی بعدی draft جدید بسازد.

### deleteCard روی draft entry
کلیک سطل زباله روی کارت draft در Library:
- `draftEntries` بدون آن id بازنویسی می‌شود.
- `projectSourceJobs[draftId]` و `projectSourceImages[draftId]` پاک می‌شوند.
- اگر `activeDraftId === draftId` → null می‌شود.
- جاب‌های سرور دست‌نخورده می‌مانند (احتمالاً قبلاً hide شده‌اند یا هنوز در workspace هستند).
- منوی delete موجود (`deleteCard`) با شاخه‌ی `if (draftEntries has id)` تفکیک می‌شود.

### Refresh
چون همه چیز در localStorage است (draftEntries + projectSourceJobs/Images + activeDraftId)، صرفاً به طور خودکار rehydrate می‌شود. Effect snapshot هم بعد از hydrate دوباره draft را همگام می‌کند.

## UI Library — سکشن Drafts

`draftItems` محاسبه‌شده در plan قبلی جایگزین می‌شود با:
- `draftItems = draftEntries` مرتب نزولی با `updated_at`.
- بخش Final videos بدون تغییر (همان `finalizedItems`).
- در `renderCard` برای variant=`draft`:
  - دکمه‌ی Download مخفی می‌شود (چون فیلم final ندارد).
  - badge «Draft» با شمارنده‌ی کلیپ‌ها هم اضافه می‌شود (مثلاً `Draft · 3 clips`).
  - thumbnail از اولین کلیپ snapshot.

`librarySavedJobs` قدیمی (snapshot تک‌کلیپ approved) از سکشن Drafts خارج می‌شود — دیگر آنجا نمایش داده نمی‌شود (همچنان در state برای سازگاری باقی می‌ماند اما نقشی در Drafts ندارد).

## ریسک
- اگر کاربر چند پنجره باز کند، هر تب draft خودش را می‌سازد و ممکن است draft تکراری دیده شود (پذیرفتنی، رفتار localStorage فعلی).
- مصرف localStorage کمی بیشتر می‌شود (یک snapshot دیگر برای draft فعال). قابل قبول.
- effect snapshot باید با debounce کوچک یا فقط هنگام تغییر شمارش/idها اجرا شود تا روی هر re-render ننویسد. (در پیاده‌سازی از مقایسه‌ی shallow ids قبل از setState استفاده می‌شود.)
