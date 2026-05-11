# هدف
وقتی روی **Start Over** کلیک می‌شود، صفحه باید کاملاً برای یک پروژه جدید ریست شود و دقیقاً مثل اسکرین‌شات دوم نمایش داده شود:
- وسط صفحه: empty state «Start forging a prompt» (بدون ویدئو در preview)
- پنل راست **HISTORY**: عدد `0` و پیام «No renders yet»
- composer پایین: prompt خالی، Start/End خالی، transitions/music/ویرایش‌ها همه پاک
- بعد از رفرش هم همین وضعیت بماند (پایدار باشد)

در عین حال طبق قانون قبلی:
- کارت‌های پنل **Library** (مرگ‌شده‌های Final Film + کلیپ‌های Approve‌شده) نباید حذف شوند
- فایل‌های روی استوریج (`merged-videos`) دست‌نخورده باقی بمانند
- هیچ jobی روی سرور پاک نشود

## مشکل فعلی
الان `handleStartOver`:
- preview را به `null` ست می‌کند، اما `previewItem` به‌صورت fallback اولین ویدئوی `visibleVideos` را نمایش می‌دهد، پس باز همان ویدئو دیده می‌شود
- لیست `generatedVideos` (پنل HISTORY) دست‌نخورده می‌ماند، در حالی که اسکرین‌شات دوم HISTORY=0 می‌خواهد

## برنامه

1. **مخفی‌کردن پایدار کارت‌های قدیمی از پنل HISTORY (بدون حذف از سرور)**
   - معرفی یک Set جدید `workspaceHiddenJobIds` که در `localStorage` نگه داشته می‌شود (per-user key مشابه `pendingEndAppendsKey`).
   - در `displayedVideos` (و هرجای دیگری که فقط History را می‌سازد) قبل از سورت، job هایی که id آن‌ها در `workspaceHiddenJobIds` است فیلتر شوند.
   - **مهم:** `visibleVideos` که پایهٔ Library (`approvedIds.has(...)`) و mergedEntries است این فیلتر را اعمال **نمی‌کند**، تا کلیپ‌های Approve‌شده و Final Film ها در Library بمانند.

2. **به‌روزرسانی `handleStartOver`**
   - id همهٔ `generatedVideos` فعلی را به `workspaceHiddenJobIds` اضافه کن و در localStorage ذخیره کن.
   - `setPreviewVideoId(null)` + `setPreviewDismissed(true)` تا fallback preview غیرفعال شود و empty state «Start forging a prompt» نشان داده شود.
   - بقیهٔ ریست‌های فعلی (transitions, manualOrder, editedClips, editedJobIds, pending appends/prepends, music, mergeProgress, prompt, uploadedFiles, uploadTarget, generationMode, durationSeconds, lockedProjectRatio) دست‌نخورده باقی می‌ماند.
   - هیچ فراخوانی حذف به سرور یا storage اضافه نمی‌شود.

3. **هم‌خوانی شمارنده‌ها و UI**
   - شمارندهٔ HISTORY روی `displayedVideos.length` (پس از فیلتر) قرار گیرد به‌جای `generatedVideos.length` تا با لیست واقعی هم‌خوان شود → نمایش `0`.
   - empty state موجود (`Film` + "No renders yet" + "New video generations will collect here.") به‌طور خودکار رندر می‌شود چون `displayedClips` خالی خواهد بود.

4. **هیدراسیون اولیه**
   - در همان effect که `generatedVideos` از سرور بارگذاری می‌شود، `workspaceHiddenJobIds` را از localStorage بخوان و state را با آن مقداردهی کن، تا بعد از F5 هم History خالی باقی بماند.

## فایل‌های درگیر
- `src/modules/generator-ui/pages/DashboardPage.tsx` — اضافه‌کردن state + persist key، فیلتر در `displayedVideos`، تغییر شمارنده HISTORY، به‌روزرسانی `handleStartOver`.

## نتیجهٔ مورد انتظار
بعد از Start Over صفحه دقیقاً مثل اسکرین‌شات دوم: preview خالی، HISTORY=0، composer تازه — اما باز کردن پنل Library همچنان همهٔ Final Film ها و کلیپ‌های Approve‌شده را نشان می‌دهد و فایل‌های سرور حفظ شده‌اند. رفرش هم وضعیت تازه را نگه می‌دارد.
