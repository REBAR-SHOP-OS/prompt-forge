## مشکل

از روی اسکرین‌شات و کد دو مشکل واضح هست:

### 1) پیش‌نمایش حالت Rendering ابعاد را اشتباه می‌سازد

در `DashboardPage.tsx` خطوط 1605-1611، کانتینر پیش‌نمایش این استایل را دارد:

```tsx
style={{
  aspectRatio: ratioToCss(getRatioFor(previewVideo)),
  height: 'min(82vh, calc((100vw - 26rem) * 9 / 16))',  // ← همیشه برای 16:9 محاسبه شده
  maxWidth: 'calc(100vw - 26rem)',
}}
```

ارتفاع ثابت برای سقف 16:9 حساب شده. وقتی کاربر 9:16 انتخاب می‌کند و کلیپ هنوز render می‌شود (ویدیویی نیست که خودش shape بدهد)، این ارتفاع کوتاه با `aspectRatio: 9/16` تبدیل به یک مستطیل پهن و کوتاه می‌شود — دقیقاً همان چیزی که در تصویر اول دیده می‌شود.

### 2) Ratio پروژه قفل نمی‌شود

وقتی کاربر آیکون مداد روی کلیپ اول (9:16) را می‌زند، `editAndReuseJob` فقط prompt و frames را ست می‌کند ولی state سراسری `aspectRatio` (که از localStorage می‌آید) ممکن است 16:9 باشد. در نتیجه job دوم با 16:9 ساخته می‌شود و placeholder هم 16:9 می‌گیرد. قانون درخواستی کاربر: **وقتی پروژه شروع شد، ابعاد قفل می‌شود تا Start Over زده شود.**

## راه‌حل

### تغییر A — ارتفاع کانتینر پیش‌نمایش متناسب با ratio

در `DashboardPage.tsx` (~خط 1605) یک helper اضافه کن که بر اساس ratio انتخاب‌شده، height ceiling مناسب می‌دهد:

```tsx
const ratioToHeight = (r: Ratio): string => {
  // عرض قابل استفاده بین دو ستون = calc(100vw - 26rem)
  // ارتفاع = عرض * (h/w) با سقف 82vh
  if (r === '9:16') return 'min(82vh, calc((100vw - 26rem) * 16 / 9))'
  if (r === '1:1')  return 'min(82vh, calc(100vw - 26rem))'
  return 'min(82vh, calc((100vw - 26rem) * 9 / 16))' // 16:9
}
```

و کانتینر:

```tsx
<div
  className="relative overflow-hidden bg-black"
  style={{
    aspectRatio: ratioToCss(getRatioFor(previewVideo)),
    height: ratioToHeight(getRatioFor(previewVideo)),
    maxWidth: 'calc(100vw - 26rem)',
  }}
>
```

این باعث می‌شود placeholder حالت Rendering هم دقیقاً مثل تصویر دوم (مستطیل عمودی باریک) رندر شود.

### تغییر B — قفل کردن Aspect Ratio در سطح پروژه

یک مفهوم "ratio قفل‌شده پروژه" اضافه کن:

1. در state، یک مقدار `lockedProjectRatio: Ratio | null` با persistence در localStorage (کلید `generator:lockedProjectRatio`).
2. هر بار که اولین کلیپ یک پروژه (یعنی `generatedVideos.filter(v => !deletedIds.has(v.id)).length === 0` قبل از submit) ساخته می‌شود، `lockedProjectRatio` را روی `aspectRatio` فعلی ست کن.
3. در `handleStartOver` آن را به `null` ریست کن (و کلید localStorage را پاک کن).
4. در UI انتخاب‌گر ratio (خطوط 2158-2180):
   - اگر `lockedProjectRatio !== null`، فقط آن گزینه فعال باشد و بقیه `disabled` با tooltip "Locked to project ratio. Use Start Over to change."
   - یک قفل کوچک (`Lock` icon از lucide) کنار گزینه فعال نمایش بده.
5. وقتی `lockedProjectRatio` ست شد، `aspectRatio` state را همگام نگه دار: `useEffect(() => { if (lockedProjectRatio) setAspectRatio(lockedProjectRatio) }, [lockedProjectRatio])`.
6. در `editAndReuseJob` نیازی به ست کردن جدا نیست چون قفل پروژه از قبل اعمال شده.

### تغییر C — مطمئن شو job جدید ratio درست را به‌خاطر بسپارد

در محل ساخت job (نزدیک خط 1007 که `rememberClipRatio(seededJob.id, aspectRatio)` صدا زده می‌شود) قبل از آن، اگر پروژه قفل شده، از `lockedProjectRatio` استفاده کن، وگرنه از `aspectRatio` فعلی. این تضمین می‌کند placeholder حالت rendering بلافاصله ratio درست را داشته باشد.

## فایل‌های تغییر

- `src/modules/generator-ui/pages/DashboardPage.tsx` — تنها فایل لازم.

## نتیجه

- placeholder حالت Rendering در ابعاد 9:16 دقیقاً مثل تصویر دوم نمایش داده می‌شود (عمودی).
- بعد از ساخت اولین کلیپ، انتخاب‌گر ابعاد قفل می‌شود؛ تا زمانی که کاربر Start Over نزده، تمام کلیپ‌های بعدی همان ابعاد را خواهند داشت — هم در backend (پارامتر `ratio` به DashScope) و هم در پیش‌نمایش UI.
