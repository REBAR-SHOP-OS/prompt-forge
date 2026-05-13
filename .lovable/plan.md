## Goal
وقتی کاربر روی چیپ فایل پیوست‌شده در composer (مثل `ai-0c493c.png Start`) کلیک می‌کند، عکس آن فایل در یک پیش‌نمایش بزرگ به او نشان داده شود. دکمه × و حذف فایل بدون تغییر باقی می‌ماند.

## Changes (frontend only — `src/modules/generator-ui/pages/DashboardPage.tsx`)

1. **State جدید برای preview**
   - `const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)`

2. **چیپ قابل‌کلیک کردن** (خط ~3761-3779)
   - تبدیل `<span>` بیرونی به `<span>` معمولی، اما نام فایل + آیکن Paperclip را داخل یک `<button type="button">` قرار می‌دهیم که فقط وقتی `file.status === 'ready'` و `file.url` وجود دارد فعال است.
   - `onClick` آن: `setPreviewImageUrl(file.url)`.
   - دکمه حذف (X) جدا از این button می‌ماند تا کلیک روی آن پیش‌نمایش باز نکند (`stopPropagation` لازم نیست چون sibling است).
   - اگر فایل در حال آپلود یا failed است، کلیک غیرفعال (`disabled` + cursor عادی).

3. **Dialog پیش‌نمایش** (انتهای JSX کنار سایر dialogها)
   - استفاده از `Dialog` موجود از `@/components/ui/dialog`.
   - `<Dialog open={!!previewImageUrl} onOpenChange={(o) => !o && setPreviewImageUrl(null)}>`
   - `DialogContent` با `max-w-3xl bg-black/90` شامل یک `<img>` با `max-h-[80vh] w-auto mx-auto object-contain`.
   - `DialogTitle` به‌صورت sr-only برای accessibility.

## Out of scope
- بدون تغییر در منطق آپلود/حذف، state آپلودها، edge functions، یا DB.
- بدون تغییر روی پنل HISTORY (آنجا قبلاً preview هست).
