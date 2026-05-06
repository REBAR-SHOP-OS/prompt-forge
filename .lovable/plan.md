## مشکل
در پایین پنل History یک نوار اسکرول افقی ظاهر شده. علت: عنصر `<video controls>` در داخل کارت‌ها یک حداقل عرض ذاتی (intrinsic min‑width) برای نوار کنترل اعمال می‌کند که از عرض پنل بزرگ‌تر می‌شود؛ container قابل‌اسکرول `overflow-y-auto` هم به‌صورت پیش‌فرض اجازه اسکرول افقی می‌دهد.

## تغییر (در `src/modules/generator-ui/pages/DashboardPage.tsx`)

1) خط 1954 — جلوگیری از اسکرول افقی در ستون History:
```tsx
// از:
<div className="mt-3 flex-1 overflow-y-auto pr-1">
// به:
<div className="mt-3 flex-1 overflow-y-auto overflow-x-hidden pr-1">
```

2) خط 1964 — اضافه‌کردن `min-w-0` به grid کارت‌ها تا فرزندان flex/grid اجازه shrink بگیرند:
```tsx
// از:
<div className="grid gap-3">
// به:
<div className="grid min-w-0 gap-3">
```

3) خطوط 1995–1997 — اضافه‌کردن `min-w-0` به wrapper ویدیو تا `<video controls>` نتواند کارت را گشاد کند:
```tsx
<div
  className="relative w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#15171a]"
  style={{ aspectRatio: ratioToCss(getRatioFor(video)) }}
>
```

## چرا امن است
- صرفاً CSS است؛ هیچ منطق، state یا API تغییر نمی‌کند.
- ابعاد عمودی، نسبت تصویر، عرض پنل و markup کارت دست‌نخورده می‌مانند.
- اسکرول عمودی (که برای پیمایش لیست لازم است) حفظ می‌شود.