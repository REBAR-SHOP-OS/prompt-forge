# نمایش عکس محصولات در انتخاب «Product narration»

در حال حاضر بخش «Product narration» داخل پنجره‌ی Voiceover فقط نام محصولات را به صورت لیست متنی نشان می‌دهد (و چون عکس‌های محصول به آن پاس داده نمی‌شوند پیام «No saved products yet» دیده می‌شود). هدف: عکس‌های محصول (از Storage › Product Photos) به صورت گرید قابل انتخاب نمایش داده شوند تا کاربر روی یکی کلیک و انتخاب کند.

## تغییرات

### ۱) `DashboardPage.tsx`
- در محل ارسال پراپ به `VoiceoverDialog` (خط ~8639)، علاوه بر `id` و `name`، آدرس تصویر هم پاس داده شود:
  - `products={archiveProductImages.map((p) => ({ id: p.id, name: p.title?.trim() || 'Untitled product', imageUrl: p.storage_path }))}`
  - `storage_path` همان URL عمومی است که در تب Product Photos برای `<img>` استفاده می‌شود.

### ۲) `VoiceoverDialog.tsx`
- تایپ پراپ `products` گسترش یابد:
  - `products?: { id: string; name: string; imageUrl?: string }[]`
- بخش انتخاب محصول در popover به یک **گرید تصویری** تبدیل شود (به جای ردیف‌های متنی):
  - هر آیتم: thumbnail مربعی از `imageUrl`، نام محصول زیر آن، و وضعیت انتخاب (حلقه/تیک سبز روی مورد انتخاب‌شده).
  - کلیک روی هر کارت → `setSelectedProductId(p.id)`.
  - گرید قابل اسکرول (مثلا ۲ تا ۳ ستونه با `max-h` و `overflow-y-auto`).
  - اگر آیتمی `imageUrl` نداشت، یک placeholder ساده نشان داده شود.
- منطق فعلی تولید نریشن (`handleGenerateNarration`)، فیلد مدت‌زمان و دکمه‌ها بدون تغییر باقی می‌مانند؛ فقط نحوه‌ی نمایش/انتخاب محصول بصری می‌شود.

## بدون تغییر
- هیچ تغییری در دیتابیس، edge functionها یا منطق تولید صدا/نریشن انجام نمی‌شود.
- صرفاً تغییر ظاهری (frontend/presentation) برای انتخاب محصول.

## اعتبارسنجی
- اجرای typecheck.
- بررسی بصری: باز کردن Voiceover › Product narration و دیدن گرید عکس‌های محصول و انتخاب یکی از آن‌ها.
