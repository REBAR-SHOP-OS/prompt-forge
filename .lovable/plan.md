## مشکل
در تصویر، کارت دوم (نسبت 1:1) از عرض پنل History بیرون زده. علت: `<article>` فاقد `min-w-0` است، و `<video>` داخل آن intrinsic width خودش (عرض ویدیوی منبع) را تحمیل می‌کند که بزرگ‌تر از عرض ستون grid است. `aspect-ratio` روی wrapper جلوی این رفتار را نمی‌گیرد چون wrapper هم می‌تواند گشاد شود.

## تغییر (در `src/modules/generator-ui/pages/DashboardPage.tsx`)

1) خط 1981 — اضافه‌کردن `min-w-0 w-full` به article تا فرزند grid اجازه shrink داشته باشد:
```tsx
className={`w-full min-w-0 cursor-pointer rounded-2xl border p-3 transition hover:border-white/20 hover:bg-white/[0.055] ${
```

2) خطوط 2000–2017 — اضافه‌کردن `max-w-full` به تگ `<video>` تا هرگز از container بزرگ‌تر نشود:
```tsx
<video
  className="h-full w-full max-w-full bg-black object-cover"
  ...
```

## چرا امن است
- فقط CSS است؛ منطق، state، یا API تغییری نمی‌کند.
- `aspect-ratio` و سایر استایل‌ها حفظ می‌شود.
- اسکرول عمودی، انتخاب کارت، drag، و دکمه‌ها دست‌نخورده می‌مانند.