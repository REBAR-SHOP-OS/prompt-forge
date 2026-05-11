# همیشه ورود به /app با وضعیت کاملاً خالی

با ورود/رفرش روی `/app`، تقریباً همه‌چیز در صفحه پاک باشد و حالت اولیه «Start forging a prompt» نمایش داده شود (مثل تصویر اول کاربر) — بدون وابستگی به اینکه کاربر قبلاً چه چیزی ساخته یا در localStorage ذخیره شده.

## رفتار

- HISTORY راست → خالی (No renders yet)
- ناحیه مرکزی → پیام Start forging a prompt
- Composer پایین → بدون آپلود Start/End، بدون متن
- Music/Voiceover → ریست
- ترنزیشن‌ها، editedClips، pendingEndAppends/Prepends → خالی
- جاب‌های جدیدی که در همین session ساخته شوند طبق روال در HISTORY ظاهر می‌شوند

داده‌های persist‌شده در localStorage پاک نمی‌شوند (امن باقی می‌مانند) — فقط در زمان mount لود نمی‌شوند.

## تغییرات کد (همه در `src/modules/generator-ui/pages/DashboardPage.tsx`)

1. **افکت ریست workspace** (~خط 1099):
   - حذف گارد `lastWorkspaceUserIdRef.current === userId`
   - تبدیل به افکت یک‌بار-روی-مونت پس از آماده‌شدن auth: روی هر mount جدید صفحه، `setGeneratedVideos([])` اجرا شود
   - همان منطق برای `lastImagesUserIdRef`

2. **افکت لود `mergedEntries` از localStorage** (~خط 748):
   - حذف خواندن از `localStorage`؛ همیشه `setMergedEntries([])` در mount
   - تابع `persistMerged` نگه داشته می‌شود تا اگر داخل session یک Final Film ساخته شد همان session نشانش بدهد، ولی در ورود بعدی لود نشود

3. **سایر state های session که از localStorage هیدریت می‌شوند** را روی mount خالی مقداردهی کن (بدون پاک‌کردن localStorage):
   - `pendingEndAppends`, `pendingStartPrepends` → `{}`
   - `editedJobIds` → خالی
   - `workspaceHiddenJobIds` → خالی
   - `projectSourceJobs` → خالی
   - `transitions` → `{}`
   - `editedClips` → `{}`
   - `uploadedFiles` → `[]`
   - `musicName/Url/Range/Duration`, `voiceoverUrl/Name`, `previewVideoId`, `selectedProjectId`, `promptText` → null/خالی

   روش: یک افکت تک‌بار `useEffect(() => { /* reset all */ }, [])` بعد از تعریف state ها، که این مقادیر را به حالت خالی برگرداند. خواندن‌های localStorage موجود به همان شکل می‌مانند ولی نتیجه‌شان توسط ریست overwrite می‌شود — برای جلوگیری از ترتیب اشتباه افکت‌ها، خواندن‌های مربوط به این state ها را حذف می‌کنیم (no-op) تا منبع حقیقت همان «خالی روی mount» باشد.

نتیجه: هر بار صفحه باز شود، UI دقیقاً مثل تصویر اول دیده می‌شود.
