تغییر z-index آیکون‌های بالا-چپ هنگام باز شدن کشوی لایبرری

وقتی کشوی لایبرری (`isApprovedPanelOpen === true`) باز می‌شود، آیکون‌های ثابت (fixed) بالا-چپ صفحه — شامل دکمه منو (LayoutGrid)، دکمه Calendar/No Occasion، Storage و UsageStats — باید پشت کشو قرار بگیرند و مخفی شوند.

**تغییرات:**
1. در `src/modules/generator-ui/pages/DashboardPage.tsx`، کلاس `z-50` دکمه منو (خط ~6079) به صورت شرطی تغییر کند: وقتی `isApprovedPanelOpen` true است `z-30`، در غیر این صورت `z-50`.
2. همین تغییر برای div گروه آیکون‌های سمت راست دکمه منو (خط ~6106) که شامل Calendar/No Occasion، Storage و UsageStats است.

**نحوه کار:** کشوی لایبرری `z-40` دارد. با کاهش z-index آیکون‌ها از `z-50` به `z-30` هنگام باز بودن کشو، آن‌ها پشت لایه کشو می‌روند و با توجه به پس‌زمینه opaque کشو، از دید کاربر پنهان می‌شوند. وقتی کشو بسته است، z-index به `z-50` برمی‌گردد و آیکون‌ها دوباره روی کشو دیده می‌شوند.

**فایل تغییر یافته:**
- `src/modules/generator-ui/pages/DashboardPage.tsx`