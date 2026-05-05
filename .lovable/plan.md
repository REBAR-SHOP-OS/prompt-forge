# Make the app fully English

The app currently mixes Persian (Farsi) and English in two files. The goal is to switch the entire UI to English only. No new translation/i18n system — just direct string replacement, since there's no requirement to keep Persian as a fallback.

## Scope

Only two files contain Persian strings:

- `src/components/auth/AuthForm.tsx` (3 strings — currently bilingual "English / Persian")
- `src/modules/generator-ui/pages/DashboardPage.tsx` (~35 strings — UI labels, tooltips, panel titles, error/empty/status messages, code comments)

`index.html` already has `lang="en"`, so no document-level changes are needed.

## Changes

### 1. `src/components/auth/AuthForm.tsx`
Strip the Persian half from the bilingual strings:
- Account-created notice → English-only
- "Confirmation email sent." → English-only
- "Resend confirmation email" → English-only

### 2. `src/modules/generator-ui/pages/DashboardPage.tsx`
Translate all Persian strings to English (mapping below). Also remove `dir="rtl"` from the modules popover and the profile panel so layout flows LTR like the rest of the app, and drop `dir="ltr"` overrides that become redundant.

| Persian → English |
|---|
| توضیح بده چه ویدئویی می‌خواهی بسازی. → Describe the video you want to generate. |
| حرکت یا تغییری که می‌خواهی روی عکس اعمال شود را توصیف کن. → Describe the motion or change to apply to the image. |
| حداقل یک عکس Start یا End اضافه کن (از دکمه‌های Start/End پایین). → Add at least one Start or End image (use the Start/End buttons below). |
| ماژول‌ها → Modules |
| پروفایل کاربر → User profile |
| ویدئوهای ساخته‌شده → Generated videos |
| ساخته‌شده‌ها → Generated |
| ویدئوهای تاییدشده → Approved videos |
| Approved outputs → (already English, keep) |
| هنوز ویدئویی ساخته نشده که بتوان ادامه‌اش را گرفت. → No video to continue from yet. |
| ادامه از آخرین ویدئوی ساخته‌شده → Continue from the latest video |
| هنوز ویدئویی تایید نشده است. → No approved videos yet. |
| بدون عنوان → Untitled |
| برداشتن از تاییدشده‌ها → Remove from approved |
| ویرایش و ادامه → Edit and continue |
| حذف → Delete |
| بستن → Close |
| هنوز ویدئویی ساخته نشده است. → No videos generated yet. |
| تایید و افزودن به ساخته‌شده‌ها → Approve and add to generated |
| برداشتن تایید → Remove approval |
| مدیر / کاربر → Admin / User |
| اعتبار → Credits |
| ویدئوها → Videos |
| عضویت از → Member since |
| خروج از حساب → Sign out |
| در حال ساخت ویدئو… → Generating video… |
| ساخت ویدئو ناموفق بود → Video generation failed |
| پیش‌نمایش ویدئو ساخته‌شده اینجا نمایش داده می‌شود → Generated video preview will appear here |

Also update the Persian inline code comments (`{/* ... */}`) to English equivalents and switch the membership date formatter from `toLocaleDateString('fa-IR')` to `toLocaleDateString('en-US')`.

## Out of scope

- No i18n framework (e.g., react-i18next) is being introduced — there's no signal the user wants multi-language support, just an English-only app.
- No changes to backend, auth flow, or business logic.
- Variable/identifier names containing English already (e.g., `Start`, `End`, `Rendering`) stay as-is.

## Files edited

- `src/components/auth/AuthForm.tsx`
- `src/modules/generator-ui/pages/DashboardPage.tsx`
