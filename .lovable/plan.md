## Change
انتقال آیکون دوربین (ساخت Cover با AI) از تولبار پایین به هدر ستون Pending.

## Edits in `src/modules/generator-ui/pages/DashboardPage.tsx`

1. **حذف** دکمه Camera (خطوط 6154–6162) از تولبار پایین.
2. **افزودن** همان دکمه در هدر ستون Pending (نزدیک خط 5247، کنار دکمه‌های Upload image / Upload film) با همان onClick:
   ```tsx
   onClick={() => { setAiDialogMode('cover'); setIsAiImageDialogOpen(true) }}
   ```
   استایل هماهنگ با بقیه دکمه‌های هدر Pending (دایره ۸×۸، حاشیه amber در hover).

## Out of scope
- بدون تغییر در منطق AiImageDialog، coverImages، یا merge.
- بدون تغییر در دکمه Sparkles (frame) که در تولبار پایین می‌ماند.
