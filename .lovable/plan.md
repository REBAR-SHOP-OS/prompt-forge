## هدف
وقتی کاربر یکی از سه نسبت `9:16 (Reels)` / `1:1 (Post)` / `16:9 (YouTube)` را انتخاب می‌کند، ویدیوی ساخته‌شده دقیقاً با همان ابعاد رندر شود — حتی اگر قبلاً کلیپی با نسبت دیگر ساخته باشد.

## تشخیص مشکل فعلی
بررسی کد نشان می‌دهد:

1. **ارسال به provider درست است**: در `external-api-adapter/service.ts` (خط 168 و 224) مقدار `ratio: input.aspectRatio` به DashScope/Wan ارسال می‌شود و `jobs-create` و `gateway` هم این مقدار را به‌درستی منتقل می‌کنند.
2. **مشکل در UI**: در `DashboardPage.tsx` متغیر `lockedProjectRatio` (خط 366-385) بعد از ساخت اولین کلیپ، نسبت پروژه را قفل می‌کند. سپس `effectiveRatio = lockedProjectRatio ?? aspectRatio` (خط 1066) باعث می‌شود حتی اگر کاربر دکمه‌ی دیگری بزند، همان نسبت قبلی به provider برود. در اسکرین‌شات کاربر هم دو دکمه `1:1` و `16:9` محو/قفل دیده می‌شوند.

## تغییرات

### فایل: `src/modules/generator-ui/pages/DashboardPage.tsx`

**1) خط 1066 — حذف اولویت `lockedProjectRatio` بر انتخاب کاربر:**
```ts
// قبل
const effectiveRatio: Ratio = lockedProjectRatio ?? aspectRatio
// بعد
const effectiveRatio: Ratio = aspectRatio
```
انتخاب فعلی کاربر همیشه به provider ارسال می‌شود.

**2) خط 381-385 — حذف افکت همگام‌سازی اجباری selector با قفل** تا کاربر بتواند آزادانه نسبت را تغییر دهد:
```ts
// حذف کامل این useEffect که selector را به مقدار قفل برمی‌گرداند
```

**3) UI دکمه‌های نسبت ابعاد (حدود خط 2388-2410)** — حذف حالت `disabled` ناشی از `lockedProjectRatio` تا هر سه دکمه همیشه قابل کلیک باشند. آیکن قفل کنار `9:16` نیز حذف می‌شود.

**4) نگه‌داشتن `lockedProjectRatio` فقط برای نمایش (preview/merge):**
- در `getRatioFor` و merge (خط 1462) همچنان از `lockedProjectRatio` برای **نمایش پروژه‌ی نهایی Final Film** استفاده می‌شود — چون merge کلیپ‌های با نسبت متفاوت معنا ندارد.
- اما **برای ساخت کلیپ جدید (jobs-create)** فقط `aspectRatio` انتخاب کاربر معتبر است.

**5) (اختیاری) اگر کاربر نسبتی متفاوت با `lockedProjectRatio` انتخاب کرد و کلیپ ساخت**، یک toast اطلاع‌رسانی نشان داده شود:
> «این کلیپ با نسبت جدید ساخته می‌شود و در Final Film با کلیپ‌های قبلی ادغام نخواهد شد.»

## چرا امن است
- پایپ‌لاین backend (gateway → service → DashScope) از قبل `aspectRatio` را درست منتقل می‌کند؛ تغییری در backend لازم نیست.
- `lockedProjectRatio` فقط برای merge/preview Final Film باقی می‌ماند، پس عملکرد ادغام نمی‌شکند.
- مقادیر مجاز (`9:16 | 1:1 | 16:9`) با enum موجود در `jobs-create` (خط 39 gateway) سازگار هستند.

## نتیجه
بعد از این تغییر، هر بار که کاربر یکی از Reels/Post/YouTube را انتخاب کند، خروجی DashScope/Wan دقیقاً با همان نسبت تولید و در history و player با همان نسبت نمایش داده می‌شود.
