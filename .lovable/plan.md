## مشکل
در تصویر، پنل History سمت راست از لبه راست صفحه بیرون زده و دکمه‌ها/متن کارت‌ها بریده می‌شوند. علت ساختاری: متن prompt در ردیف `flex` کارت بدون `min-w-0` است، پس کلمات طولانی (مثل نام فایل پیوست) عرض پنل را به‌زور باز می‌کنند و کل ردیف از کادر بیرون می‌زند. این مستقل از نسبت تصویر (1:1، 9:16، ...) است؛ کاربر می‌خواهد در همین عرض فعلی، محتوای کارت کامل دیده شود.

## تغییر
فقط در `src/modules/generator-ui/pages/DashboardPage.tsx`، خطوط 2031–2034 (ردیف عنوان کارت در پنل راست):

پیش:
```tsx
<div className="mt-3 flex items-start justify-between gap-3">
  <p className="max-h-12 overflow-hidden text-sm font-medium leading-6 text-zinc-200">
    {video.input_prompt}
  </p>
```
پس:
```tsx
<div className="mt-3 flex items-start justify-between gap-2">
  <p className="max-h-12 min-w-0 flex-1 overflow-hidden whitespace-normal break-words text-sm font-medium leading-6 text-zinc-200">
    {video.input_prompt}
  </p>
```

تغییرات:
- `min-w-0 flex-1` → اجازه می‌دهد متن داخل ردیف flex کوچک شود به جای فشار آوردن به کارت.
- `whitespace-normal break-words` → کلمات طولانی (filename فارسی/انگلیسی) درون کارت می‌شکنند و سرریز نمی‌کنند.
- `gap-3 → gap-2` → فاصله کمی کمتر، تا 4 آیکن کنار متن راحت‌تر جا شوند.

## چرا امن است
- فقط CSS است؛ هیچ منطق، state یا API تغییر نمی‌کند.
- markup کارت، نسبت ویدیو (`aspectRatio`)، و عرض پنل (که در پیام قبلی تنظیم شد) دست‌نخورده می‌مانند.
- در همه نسبت‌ها (1:1, 9:16, 16:9) و همه breakpoints اعمال می‌شود چون مشکل ساختاری است نه ابعادی.

## خارج از scope
- تغییر آیکن‌ها، رنگ‌ها، یا ساختار دکمه‌ها.
- تغییر مجدد عرض ستون.