## هدف
نشان «Live preview» همیشه دیده شود و پیش‌نمایش تک‌ویدیویی هم مثل Final Film، موزیک و ویس‌اوور را به صورت خودکار پخش کند.

## تغییرات

### 1) `src/modules/generator-ui/components/SequentialClipPlayer.tsx`
- در نشان «Live preview» (خط ۲۸۵)، کلاس `hidden ... sm:inline` را به `inline` تغییر می‌دهیم تا در همه اندازه‌های صفحه دیده شود.

### 2) `src/modules/generator-ui/components/VideoWithSoundtrack.tsx`
- یک نشان کوچک «Live preview» با همان استایل سبز در گوشه پایین-راست عنصر `<video>` اضافه می‌کنیم (پوشش مطلق روی ویدیو).
- چون این کامپوننت Fragment بر می‌گرداند، آن را داخل یک `<div className="relative ...">` می‌پیچیم تا badge بتواند `absolute` روی ویدیو قرار بگیرد. کلاس‌های اضافه‌ای که از طریق `className` به video پاس می‌شد روی wrapper اعمال می‌شود تا layout تغییر نکند.

### 3) سینک خودکار صدا در پیش‌نمایش تک‌ویدیویی
سینک از قبل توسط `VideoWithSoundtrack` انجام می‌شود. تنها بهبود کوچک:
- در `VideoWithSoundtrack`، اگر کاربر روی ▶ پیش‌فرض مرورگر بزند و موزیک/ویس‌اوور به دلیل سیاست autoplay شروع نشود، در `play` event دوباره تلاش شود (در حال حاضر همین رفتار وجود دارد، فقط مطمئن می‌شویم event listener قبل از اولین play ثبت شده است — نیاز به تغییر منطقی نیست).

## خارج از محدوده
- بدون تغییر در state موزیک/ویس‌اوور، آپلود، یا pipeline رندر Final Film.
- بدون تغییر در `SequentialClipPlayer` به جز نمایش همیشگی badge.