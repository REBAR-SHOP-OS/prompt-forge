## افزودن تقویم مصرف روزانه به Usage & Credits

به popover موجود (`UsageStatsPopover.tsx`) یک بخش تقویم اضافه می‌شود که برای هر روز ماه جاری، مجموع مصرف اعتبار و معادل دلاری آن را نشان می‌دهد.

### آنچه کاربر می‌بیند

- یک بخش جدید زیر «How many more videos today?» با عنوان **«مصرف روزانه (این ماه)»**
- گرید تقویم ۷ستونه (یکشنبه تا شنبه) شبیه date-picker
- هر سلول روز نمایش می‌دهد:
  - شماره روز
  - مبلغ دلاری مصرف آن روز (مثل `$0.45`) — اگر صفر باشد خالی/کم‌رنگ
- شدت رنگ پس‌زمینه سلول بر اساس میزان مصرف (heatmap سبک با toneهای amber)
- روز جاری حاشیه برجسته دارد
- hover روی هر سلول tooltip با جزئیات: تعداد job ها + credits + dollars
- ناوبری ماه قبل/بعد با دو دکمه chevron در هدر بخش
- مجموع ماه در پایین: `Total: $X.XX · N videos`

### منبع داده

یک query اضافه به `billing_credit_transactions` که در همان `load()` موازی با بقیه اجرا می‌شود:

```ts
supabase
  .from('billing_credit_transactions')
  .select('amount, created_at')
  .eq('user_id', user.id)
  .eq('type', 'spend')
  .gte('created_at', monthStart.toISOString())
  .lt('created_at', nextMonthStart.toISOString())
```

نتیجه در client به صورت `Map<YYYY-MM-DD, { credits: number, count: number }>` aggregate می‌شود. تبدیل به دلار: `credits / 100`.

برای ناوبری ماه، state جدید `viewMonth: Date` اضافه می‌شود و با تغییرش `load()` دوباره صدا زده می‌شود (یا فقط query تقویم مجدداً اجرا می‌شود تا بقیه stats بی‌دلیل refetch نشوند — بهینه‌تر).

### فایل‌ها

- **EDIT** `src/modules/generator-ui/components/UsageStatsPopover.tsx`
  - اضافه شدن state: `viewMonth`, `dailySpend: Map<string, {credits, count}>`
  - اضافه شدن query تقویم در `load()` + یک loader جداگانه برای تغییر ماه
  - اضافه شدن JSX بخش calendar grid با heatmap
  - افزایش عرض popover از `w-[340px]` به حدود `w-[380px]` تا تقویم جا شود

### بدون تغییرات backend

هیچ migration، edge function، یا RLS جدیدی لازم نیست. جدول `billing_credit_transactions` قبلاً با `auth.uid() = user_id` محافظت شده.

### ریسک

پایین. صرفاً یک query read-only اضافه + UI. هزینه query کم است (per-user، per-month، با index موجود روی user_id).
