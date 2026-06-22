# Fix Transcript Panel: English UI + Duplicate Close Button

## Problem
1. The transcript overlay still uses Persian strings (header, loading text, error messages, retry button, "Original text" label). The user wants the whole UI in English.
2. The large preview's own close button (`X`, top-right, `z-30`) renders **on top of** the transcript panel (`z-20`), so when the panel opens its own `X` close button appears next to the preview's `X` — looking like two close buttons.

## Changes

### 1. `src/modules/generator-ui/components/TranscriptPanel.tsx` — English strings
- `LANGUAGES`: change the `ORIGINAL` label `'متن اصلی'` → `'Original'`. Keep native language labels (English, Français, etc.) as-is, but switch `'فارسی'` → `'Persian'` and `'العربية'` → `'Arabic'` for consistency (or keep native — will use English names).
- Header `'متن فیلم'` → `'Transcript'`.
- `SelectValue` placeholder `'زبان'` → `'Language'`.
- Loading text `'در حال پردازش…'` → `'Processing…'`.
- Retry button `'تلاش دوباره'` → `'Retry'`.
- Error/fallback strings:
  - `'فایل ویدیو در دسترس نیست.'` → `'Video file is not available.'`
  - `'خطا در رونویسی'` → `'Failed to transcribe.'`
  - `'گفتاری در این فیلم تشخیص داده نشد.'` → `'No speech detected in this video.'`
  - `'متنی برای نمایش وجود ندارد.'` → `'No text to display.'`
  - `'ترجمه‌ای دریافت نشد.'` → `'No translation received.'`
  - `'خطا در ترجمه'` → `'Failed to translate.'`

### 2. `src/modules/generator-ui/pages/DashboardPage.tsx` — fix duplicate close + English labels
- FileText (transcript) button: `aria-label="نمایش متن فیلم"` → `"Show transcript"`, `title="متن فیلم"` → `"Transcript"`.
- Fix the duplicate close button: when `transcriptOpen` is true, hide the preview's own close button and the FileText button (the panel has its own header with close). Apply a conditional so only the panel's controls show while it is open:
  - Wrap the two corner buttons (close + FileText) so they render only when `!transcriptOpen`, e.g. `{!transcriptOpen && (<>…buttons…</>)}`.

This keeps a single close affordance (the panel's `X`) while the transcript is open, and restores the preview close + transcript buttons after it closes.

## Verification
- Open the large preview, click the transcript icon, confirm: only one close button (in the panel header), all text is English, language menu shows "Original" + language names.
