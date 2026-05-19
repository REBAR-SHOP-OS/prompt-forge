## هدف
وقتی روی آیکون Regenerate یک کارت کلیک می‌شود، به جای استفاده‌ی خودکار از پروایدر/مدل اصلی همان کارت، یک منوی انتخاب باز شود تا کاربر پروایدر/مدل دلخواه برای ساخت مجدد را انتخاب کند.

## تغییرات (فقط فرانت‌اند، فقط `DashboardPage.tsx`)

1. **State جدید**
   - `regenerateTarget: JobDetail | null` — کارتی که منوی انتخاب پروایدر برایش باز است.

2. **تغییر رفتار دکمه Regenerate (حدود خط 4277)**
   - به‌جای فراخوانی مستقیم `regenerateCard(video)`، یک `DropdownMenu` (از `@/components/ui/dropdown-menu` که قبلاً در پروژه هست) باز شود.
   - آیتم‌های منو از `MODEL_CHOICES` ساخته شوند و بر اساس وجود/نبود فریم (i2v vs t2v) فیلتر شوند:
     - اگر کارت `first_frame_url` یا `last_frame_url` دارد → فقط مدل‌هایی که `supports.includes('i2v')`.
     - در غیر این صورت → فقط `t2v`.
   - مدل اصلی همان کارت با نشانه «(Current)» در منو علامت بخورد.

3. **تغییر امضای `regenerateCard`**
   - پارامتر اختیاری `override?: { providerKey: 'wan'|'flow'; requestedModel: string }` اضافه شود.
   - اگر `override` پاس شد، به‌جای `job.provider_key`/`job.model_key` از آن استفاده کند.
   - بقیه‌ی منطق (duration، aspect ratio، frames، seededJob، replace in place، delete old) دست‌نخورده بماند.

4. **بدون تغییر در بک‌اند**
   - Edge functions و `jobs-create` نیاز به هیچ تغییری ندارند — همان `providerKey` و `requestedModel` که از قبل می‌پذیرند.

## نکات
- اگر کارت i2v باشد و کاربر مدلی انتخاب کند که i2v پشتیبانی نمی‌کند → آیتم اصلاً در منو نشان داده نمی‌شود (نیازی به پیام خطا نیست).
- برای 45s/scenario هیچ تغییری لازم نیست؛ این فقط روی regenerate تک‌کارتی اثر می‌گذارد.
- آیکون و tooltip دکمه ثابت بماند؛ فقط رفتار کلیک عوض می‌شود.
