## هدف

Storage باید آرشیو دائمی همه‌ی فیلم‌های ساخته‌شده باشد. پاک‌کردن کلیپ/فیلم در درفت یا فاینال فقط باید آن را از ورک‌اسپیس پنهان کند و **هیچ‌گاه** رکورد سروری را حذف نکند. تنها جایی که حذف دائمی اتفاق می‌افتد، دکمه‌ی Trash داخل خود پنل Storage است.

## وضعیت فعلی

در `DashboardPage.tsx` چهار مسیر، job را به‌صورت سروری و دائمی حذف می‌کنند (`jobOrchestratorGateway.deleteJob`) که باعث می‌شود فیلم از Storage هم پاک شود:

- `deleteCard` شاخه‌ی درفت — حذف کلیپ‌های زیرین درفت (خط ~۱۷۰۴)
- `deleteCard` شاخه‌ی کارت تکی — حذف یک کلیپ/کارت (خط ~۱۸۴۹)
- مسیر regenerate — حذف نسخه‌ی قدیمی جایگزین‌شده (خط ~۳۹۹۹)
- `handleStartOver` — حذف job‌های loose (خط ~۴۷۴۰)

از طرف دیگر، سازوکار `workspaceHiddenJobIds` از قبل وجود دارد: یک tombstone محلی که job را از ورک‌اسپیس پنهان می‌کند بدون حذف سروری (در فیلترهای `visibleVideos` اعمال می‌شود) و در localStorage هم persist می‌شود. خود پنل Storage مستقل از این tombstone، لیست job‌ها را از سرور می‌خواند، پس job‌های پنهان‌شده همچنان در Storage دیده می‌شوند.

## تغییرات

همه‌ی تغییرات فقط در `src/modules/generator-ui/pages/DashboardPage.tsx` و فقط در سمت فرانت/state است.

1. **شاخه‌ی درفت در `deleteCard`:** فراخوانی حذف سروری کلیپ‌ها حذف می‌شود. به‌جای آن `clipIds` به `workspaceHiddenJobIds` افزوده و persist می‌شود. tombstoneهای فعلی (`deletedDraftIds`) و پاک‌سازی snapshotهای محلی درفت دست‌نخورده باقی می‌مانند تا کارت درفت برنگردد.

2. **شاخه‌ی کارت تکی در `deleteCard`:** برای job واقعی، به‌جای `await deleteJob(jobId)` فقط `jobId` به `workspaceHiddenJobIds` افزوده و persist می‌شود. مسیر merged (Final Film محلی) و سایر پاک‌سازی‌های state بدون تغییر می‌مانند.

3. **مسیر regenerate:** پاک‌سازی سروری نسخه‌ی قدیمی حذف می‌شود؛ به‌جای آن id قدیمی به `workspaceHiddenJobIds` افزوده می‌شود تا از ورک‌اسپیس برود ولی در Storage بماند.

4. **`handleStartOver`:** حذف سروری `looseJobIds` برداشته می‌شود (هم‌اکنون `resetWorkspace` این job‌ها را در `workspaceHiddenJobIds` پنهان می‌کند، پس پنهان‌سازی از قبل پوشش داده شده). فقط بخش drop کردن از state محلی نگه داشته می‌شود.

5. **پنل Storage بدون تغییر:** تنها `handleDeleteArchiveJob` (دکمه‌ی Trash در Storage) همچنان `jobOrchestratorGateway.deleteJob` را صدا می‌زند — این تنها مسیر حذف دائمی است.

نکته: حذف تصاویر ورودی (`deleteUserImage`) دست‌نخورده می‌ماند، چون تصاویر منبع «فیلم» نیستند و در Storage فهرست نمی‌شوند.

## جزئیات فنی

- `workspaceHiddenJobIds` یک `Set<string>` با persist در localStorage (`persistWorkspaceHiddenJobIds`) است و در فیلترهای `visibleVideos` (خطوط ~۲۳۷۸، ~۲۴۸۱، ~۴۱۳۶) اعمال می‌شود.
- چون دیگر job سروری حذف نمی‌شود، باید مطمئن شویم tombstoneهای محلی (`workspaceHiddenJobIds` + `deletedDraftIds`) از بازسازی کارت‌ها در افکت backfill/hydrate جلوگیری می‌کنند؛ این tombstoneها از قبل persist و در منطق گروه‌بندی لحاظ شده‌اند.
- منطق rollback خوش‌بینانه در شاخه‌ی کارت تکی ساده می‌شود چون دیگر فراخوانی شبکه‌ای شکست‌خور نداریم.

## تأیید

- پاک‌کردن یک کلیپ در ورک‌اسپیس/درفت → کارت از ورک‌اسپیس می‌رود ولی همچنان در Storage هست.
- Start Over → ورک‌اسپیس خالی می‌شود ولی فیلم‌ها در Storage می‌مانند.
- regenerate → نسخه‌ی قدیمی در ورک‌اسپیس جایگزین می‌شود ولی در Storage باقی می‌ماند.
- دکمه‌ی Trash در Storage → حذف دائمی واقعی (تنها مسیر حذف).
- رفرش صفحه پس از حذف → کارت‌های پنهان‌شده در ورک‌اسپیس برنمی‌گردند.