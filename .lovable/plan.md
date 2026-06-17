# افزودن «Schedule to Social Media» به فیلم نهایی

بله، این کار کاملاً شدنی است و یک تغییر فقط فرانت‌اند در `DashboardPage.tsx` است. کد سمت Rebar OS از قبل listener را آماده کرده؛ ما فقط باید آیکون تقویم + Popover + ارسال پیام postMessage را اضافه کنیم.

## رفتار نهایی

- در نوار بالای صفحه (کنار `Preview` و `Start over`) یک دکمه‌ی آیکون تقویم (`CalendarPlus` از lucide) اضافه می‌شود.
- این دکمه **فقط وقتی یک فیلم نهایی read-only باز است** نمایش داده می‌شود (شرط `isReadOnlyProject`).
- کلیک روی آن یک `Popover` باز می‌کند شامل:
  - Date picker (shadcn Calendar داخل Popover با `pointer-events-auto`)
  - Time picker (input `type="time"`، پیش‌فرض `10:00`)
  - دکمه‌ی «Send to Social Media Manager»
- با کلیک دکمه، پیام زیر به parent ارسال می‌شود (origin قفل‌شده روی Rebar OS، نه `"*"`):

```text
window.parent.postMessage({
  type: "rebar.finalFilm.scheduleToSocial",
  payload: {
    videoUrl, posterUrl, mimeType: "video/mp4",
    durationSec, caption, scheduledAt   // ISO ترکیب date + time
  }
}, "https://os.rebar.shop");
```

- سپس toast «Sent to Social Media Manager» نمایش داده می‌شود و Popover بسته می‌شود.

## منبع داده‌ی payload

از همان فیلم نهایی read-only که نمایش داده می‌شود استخراج می‌شود:
- `videoUrl`: لینک **عمومی پایدار** فایل از باکت `merged-videos` با `getPublicUrl(storage_path)` — تا اپ مقصد بتواند مستقل آن را fetch کند (نه blob موقت یا signed URL کوتاه‌عمر).
- `posterUrl`: `thumbnail_url` همان entry در صورت وجود (در غیر این صورت حذف می‌شود).
- `durationSec`: `duration` / `duration_seconds` همان entry در صورت وجود.
- `caption`: متن brief / `input_prompt` پروژه‌ی انتخاب‌شده در صورت وجود.
- `scheduledAt`: ترکیب تاریخ انتخابی + ساعت به‌صورت ISO محلی.

## جزئیات فنی

- **محل کد:** بلوک نوار دکمه‌ها در `src/modules/generator-ui/pages/DashboardPage.tsx` (حوالی خط ۷۳۴۱، داخل `{!isReadOnlyProject && ...}` نه — بلکه یک بلوک جدید `{isReadOnlyProject && (...)}`).
- **import ها:** `CalendarPlus` از `lucide-react`، `Popover/PopoverTrigger/PopoverContent`، `Calendar`، `Button` از کامپوننت‌های موجود ui؛ `toast` از `sonner`.
- **ثابت origin:** یک ثابت ماژول‌سطح `const SOCIAL_PARENT_ORIGIN = "https://os.rebar.shop"` تعریف می‌شود و در `postMessage` به‌جای `"*"` استفاده می‌شود.
- **state محلی:** `scheduleDate` (Date) و `scheduleTime` (string، پیش‌فرض `"10:00"`).
- **محافظت:** اگر `window.parent === window` (اپ خارج از iframe باز شده) دکمه کار نمی‌کند و یک toast راهنما نشان می‌دهد؛ هیچ تغییری در منطق merge/storage داده نمی‌شود.

## بدون تغییر در

- منطق backend، edge functions، schema، یا فرآیند merge/finalize.
- رفتار دکمه‌های موجود Preview / Start over.
