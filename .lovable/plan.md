## Goal

روی کارت‌های تصویر آپلودی در ستون Recent outputs، به‌جای فیلد عددی Duration یک سه‌گزینه‌ای **5s / 10s / 15s** قرار دهیم — دقیقاً همان استایلِ پیل‌های انتخاب مدت‌زمان ویدئو در کامپوزر پایین صفحه. هر تصویر همچنان مدت اختصاصی خودش را در DB نگه می‌دارد (`still_duration_seconds`) و در ساخت Final Film از همان مقدار استفاده می‌شود.

## Changes

### `src/modules/generator-ui/pages/DashboardPage.tsx`

**جایگزینی UI انتخاب مدت در کارت تصویر (حدود خط 2445–2464):**

به‌جای `<input type="number">` فعلی، یک گروه پیل با همان ظاهر گروه پیل‌های مدت ویدئو در کامپوزر (خطوط 2908–2924) قرار می‌گیرد:

```tsx
<div
  className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500"
  onClick={(event) => event.stopPropagation()}
>
  <div className="inline-flex items-center gap-2">
    <span>Duration</span>
    <div role="radiogroup" aria-label="Image duration in Final Film"
         className="inline-flex rounded-full border border-white/10 bg-black/20 p-0.5 text-[11px] font-semibold">
      {([5, 10, 15] as const).map((sec) => {
        const active = (img.still_duration_seconds || 3) === sec
        return (
          <button
            key={sec}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => updateImageDuration(img.id, sec)}
            className={`rounded-full px-2.5 py-1 transition ${active ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {sec}s
          </button>
        )
      })}
    </div>
  </div>
  <span>{formatCreatedAt(img.created_at)}</span>
</div>
```

**نکات پیاده‌سازی:**
- از تابع موجود `updateImageDuration(imageId, seconds)` (خط 994) بدون تغییر استفاده می‌شود — همان منطق به‌روزرسانی state + DB.
- مقدار پیش‌فرض رکوردهای قبلی (`3`) به این معنی است که هیچ‌کدام از سه پیل فعال نخواهد بود تا کاربر یکی را انتخاب کند. این رفتار قابل قبول است چون کاربر می‌تواند فوراً یکی را برگزیند؛ پس از انتخاب، مقدار جدید ذخیره می‌شود.
- `onClick={(event) => event.stopPropagation()}` روی container حفظ می‌شود تا کلیک روی پیل‌ها preview مرکزی را تغییر ندهد.

### بدون تغییر

- منطق Final Film: `handleMergeAllVideos` (خط 1668) همچنان از `clip.image.still_duration_seconds` و clamp بین 1 تا 15 استفاده می‌کند — مقادیر 5/10/15 کاملاً سازگارند.
- اسکیمای دیتابیس بدون تغییر (`still_duration_seconds integer DEFAULT 3`).
- بقیه‌ی کارت تصویر (drag handle، شماره، trash، انتخاب preview) دست‌نخورده باقی می‌ماند.

## Out of scope

- تغییر مقادیر قابل‌انتخاب (مثلاً افزودن 20s/30s)؛ فقط همان سه گزینه‌ی استاندارد ویدئو.
- تغییر مقدار پیش‌فرض رکوردهای موجود در DB.
