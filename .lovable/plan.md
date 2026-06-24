## هدف
بخش لوگوی شرکت (آیکون لوگو + دکمه‌ی **Replace** + دکمه‌ی حذف) که الان پایین در «Contact details» قرار دارد، به **بالای دیالوگ، بالای عنوان About your business (required)** منتقل شود. این یک تغییر صرفاً UI است.

## تغییرات (فقط `BusinessProfileDialog.tsx`)
- بلوک کنترل لوگو (نمایش لوگو/placeholder، دکمه‌ی Company logo/Replace، و دکمه‌ی ✕ برای حذف) از داخل بخش «Contact details (shown on video)» برداشته شود.
- همان بلوک به بالای محتوای دیالوگ منتقل شود — بالای عنوان «About your business (required)» (بالای `DialogHeader` یا درست زیر آن، به‌صورت یک ردیف لوگو در بالا).
- بقیه‌ی فیلدها (متن کسب‌وکار، دستورالعمل نریشن، وب‌سایت/تلفن/آدرس) بدون تغییر باقی می‌مانند.
- منطق آپلود/تغییر اندازه‌ی لوگو (`onContactLogoFile`) و state (`contactLogo`) و ذخیره‌سازی (`contact_logo_url`) دست‌نخورده می‌ماند؛ فقط محل نمایش جابه‌جا می‌شود.

## فایل متأثر
- `src/modules/generator-ui/components/BusinessProfileDialog.tsx`
