# رفع نمایش‌نشدن عکس‌های محصول در انتخابگر Product Ad

## مشکل
در دیالوگ «Choose from products»، URL هر عکس با `supabase.storage.from('user-images').getPublicUrl(storage_path)` ساخته می‌شود. اما در این پروژه ستون `storage_path` در جدول `generator_user_images` از قبل **خودِ URL عمومی کامل** را نگه می‌دارد (هنگام آپلود: `storage_path: publicUrl`). در نتیجه دوباره داخل `getPublicUrl` پیچیده می‌شود و یک آدرس خراب تولید می‌شود؛ برای همین فقط متن جایگزین (alt) دیده می‌شود.

## راه‌حل
در `src/modules/generator-ui/components/ProductAdDialog.tsx`، تابع `openProductPicker`:
- به‌جای `getPublicUrl(r.storage_path)`، مستقیماً از `r.storage_path` به‌عنوان `url` استفاده شود.

این موضوع هم نمایش گرید و هم فراخوانی Reframe را درست می‌کند، چون `photo.url` همان آدرس معتبر می‌شود.

## تأیید
بعد از تغییر، باز کردن انتخابگر باید تصاویر محصولات را نمایش دهد و انتخاب یک محصول باید Reframe را با URL معتبر اجرا کند.
