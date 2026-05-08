## مشکل
کلیک روی X واقعاً preview را نمی‌بندد چون `previewItem` (خط 870) وقتی `previewVideoId` خالی است به‌صورت fallback اولین ویدیوی موجود را برمی‌گرداند. پس `setPreviewVideoId(null)` فقط انتخاب کارت را پاک می‌کند و بلافاصله fallback نمایش داده می‌شود.

## راه‌حل
افزودن یک state صریح برای «بسته‌بودن» پیش‌نمایش:

1. `const [previewDismissed, setPreviewDismissed] = useState(false)` کنار `previewVideoId`.
2. در `previewItem` useMemo، در ابتدای تابع: اگر `previewDismissed && !previewVideoId` بود → `return null` (هم fallback ویدیو و هم fallback تصویر را skip می‌کند و empty state نمایش داده می‌شود).
3. دکمه‌ی X (هر دو محل image/video preview): `setPreviewVideoId(null); setPreviewDismissed(true)`.
4. هر جا کاربر کارت تاریخچه را انتخاب می‌کند (`setPreviewVideoId(...)` با id واقعی)، همزمان `setPreviewDismissed(false)` صدا زده شود تا preview دوباره باز شود. به‌جای پراکنده‌کردن، می‌توان یک هلپر کوچک `openPreview(id)` تعریف کرد که هر دو را یکجا انجام دهد و در همه‌ی onClick/onKeyDown کارت‌ها استفاده شود.

## فایل
- `src/modules/generator-ui/pages/DashboardPage.tsx`

## بدون ریسک
- صرفاً افزودن یک flag و چند فراخوانی setter؛ منطق داده دست‌نخورده.
- empty state موجود (Hammer/Sparkles) خودش وقتی `previewItem` null باشد رندر می‌شود.