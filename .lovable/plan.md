افزودن گزینه‌ی **30s** به انتخاب‌گر مدت‌زمان کلیپ، بین `15s` و `45s`.

پیاده‌سازی همان الگوی 45s/135s است (Auto-split به چند صحنه‌ی 15s)، چون پروایدر فعلی کلیپ‌های ۵/۱۰/۱۵ ثانیه‌ای می‌سازد:

تغییرات در `src/modules/generator-ui/pages/DashboardPage.tsx`:

1. خط 482 — توسعه‌ی type:
   ```
   useState<5 | 10 | 15 | 30 | 45 | 135>(5)
   ```
2. خط 5613 — افزودن `30` به لیست رادیو:
   ```
   [5, 10, 15, 30, 45, 135]
   ```
3. خط 2751 — اضافه‌کردن 30 به branch اسپلیت:
   ```
   if (durationSeconds === 30 || durationSeconds === 45 || durationSeconds === 135)
   ```
4. خط 2752 — تعداد صحنه‌ها:
   ```
   const expectedScenes = durationSeconds === 135 ? 9 : durationSeconds === 45 ? 3 : 2
   ```
5. خط 2785–2787 — fallback تکرار:
   ```
   const iterations = durationSeconds === 135 ? 9 : durationSeconds === 45 ? 3 : durationSeconds === 30 ? 2 : 1
   const perClipDuration: 5 | 10 | 15 =
     (durationSeconds === 30 || durationSeconds === 45 || durationSeconds === 135) ? 15 : durationSeconds
   ```
6. خط 4365 — type widen در `defaultDuration` prop: شامل کردن 30 در مسیر split.

فایل‌های تغییریافته:
- `src/modules/generator-ui/pages/DashboardPage.tsx` (تنها)

ریسک‌ها:
- اگر edge function `scenario-write` با `durationSeconds: 30` صحنه‌های کمتر از 2 برگرداند، fallback قانون legacy (2 کلیپ ۱۵ ثانیه‌ای با همان پرامپت) فعال می‌شود — رفتار سازگار با 45s.
- هیچ تغییر backend/auth/DB لازم نیست.