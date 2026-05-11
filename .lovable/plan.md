## Goal
وقتی کاربر روی «Mute audio» کلیک می‌کند، دکمه «Apply changes» باید فعال شود (حتی بدون اینکه هیچ بازه‌ای cut شده باشد) و با زدن آن، صدای ویدئوی کارت کاملاً حذف شود.

## رفتار فعلی
- دکمه Apply فقط زمانی فعال است که `norm.length > 0` (حداقل یک بازه‌ی برش وجود داشته باشد).
- اگر فقط mute بزنیم، Apply غیرفعال می‌ماند → نمی‌توان فقط صدا را حذف کرد.

## تغییرات

### ۱) `src/modules/generator-ui/components/ClipTrimmerDialog.tsx`
- شرط `disabled` دکمه Apply را عوض کن:
  - از: `disabled={busy || norm.length === 0}`
  - به: `disabled={busy || (norm.length === 0 && !muteAudio)}`
- در تابع `apply`:
  - شرط «No ranges to remove» را فقط زمانی throw کن که `muteAudio` هم false باشد. در غیر این صورت، اجازه بده با `cuts=[]` برود به `trimVideoLocally` که خروجی همان ویدئو ولی بدون صدا تولید کند.

### ۲) `src/modules/generator-ui/lib/trimVideo.ts`
- `normalizeCuts` با آرایه‌ی خالی → `[]` برمی‌گرداند، که باعث می‌شود `totalKeptDuration` = duration کامل و حلقه‌ی tick هیچ seek/pause نکند → نتیجه: کل ویدئو re-encode می‌شود بدون صدا (چون audio capture skip شده).
- بررسی کن که با `norm = []` و `muteAudio=true` مسیر کار کند (به نظر بدون تغییر کد کار می‌کند، فقط verify).

## نتیجه
- کلیک روی Mute → دکمه Apply روشن می‌شود.
- Apply → خروجی mp4/webm بدون track صوتی تولید و در همان onApply روی کارت جایگزین می‌شود (همان مسیر فعلی، بدون تغییر در منطق کارت).
