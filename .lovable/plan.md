## هدف

دیالوگ **Storage** به‌جای خواندن از دیتابیس/باکت‌های Supabase، مستقیماً محتوای فولدر NAS را نشان بدهد و حذف هم روی همان فولدر انجام شود:

```
/volume1/video/REBAR SHOP OS VIDEOS   (روی NAS 1)
```

هر سه تب (Films / Images / Audio) از همین فولدر خوانده می‌شوند و فایل‌ها بر اساس پسوند دسته‌بندی می‌شوند (mp4/mov → Films، jpg/png/webp → Images، mp3/wav/m4a → Audio).

## نکته‌ی مهم قبل از شروع (بلاکر)

۱. الان **هیچ secretی برای NAS تنظیم نشده**. لیست secretها فقط `GEMINI_API_KEY`, `LOVABLE_API_KEY`, `WAN_API_KEY` است. قبل از پیاده‌سازی باید این‌ها اضافه شوند:
   `SYNOLOGY_SSH_HOST`، `SYNOLOGY_SSH_PORT`، `SYNOLOGY_SSH_USER`، `SYNOLOGY_SSH_PRIVATE_KEY`، (اختیاری) `SYNOLOGY_SSH_PASSPHRASE`.

۲. ادج‌فانکشن‌ها در فضای ابری اجرا می‌شوند، پس **NAS باید از اینترنت قابل دسترسی باشد** (IP/پورت عمومی یا DDNS + port-forward روی پورت SSH). اگر NAS فقط در شبکه‌ی محلی باشد، سرور ابری نمی‌تواند به آن وصل شود و این قابلیت کار نخواهد کرد.

اگر این دو فراهم باشد، طبق ادامه پیش می‌رویم.

## معماری

```text
Storage Dialog (DashboardPage)
        │  invoke
        ▼
 edge function: nas-storage   ──SFTP/SSH──▶  NAS 1  /volume1/video/REBAR SHOP OS VIDEOS
   actions: list | stream | delete
```

تمام ارتباط با NAS فقط در ادج‌فانکشن انجام می‌شود (هیچ کلید/هاستی به فرانت‌اند نمی‌رود).

## تغییرات

### ۱. هلپر SSH اشتراکی
`supabase/functions/_shared/synology-ssh.ts` با `connect()`, `sftpList()`, `sftpReadRange()`, `sftpDelete()` بر پایه‌ی `ssh2` و normalize کردن کلید PEM در حافظه (طبق اسکیل Synology). کلید هیچ‌وقت لاگ نمی‌شود.

### ۲. ادج‌فانکشن جدید `nas-storage`
- `GET ?action=list` → فهرست فایل‌های فولدر با `name, size, mtime, ext, kind(film/image/audio)`.
- `GET ?action=stream&path=...&token=...` → استریم بایت‌ها با پشتیبانی از HTTP Range (برای پخش ویدیو و نمایش عکس/صدا در `<video>/<img>/<audio>`).
- `POST ?action=delete` با body `{ paths: string[] }` → حذف فایل‌(ها) از NAS.
- احراز هویت با JWT کاربر (مثل `video-proxy`؛ توکن از هدر یا کوئری‌استرینگ).
- جلوگیری از path traversal: مسیر باید داخل همان فولدر پایه باشد.

### ۳. اتصال فرانت‌اند (DashboardPage.tsx)
- `loadArchive` بازنویسی می‌شود تا `nas-storage?action=list` را صدا بزند و خروجی را به سه گروه films/images/audio تقسیم کند (به‌جای `listMyJobs/listMyVideos/Supabase queries`).
- URL پخش/نمایش هر آیتم به `nas-storage?action=stream&path=...&token=...` تغییر می‌کند.
- حذف تکی و **حذف گروهی (Select All)** موجود به `nas-storage?action=delete` وصل می‌شوند (state انتخاب و UI فعلی حفظ می‌شود؛ آیدی = مسیر فایل).
- شمارنده‌ی بالای دیالوگ (مثل «38») از تعداد واقعی فایل‌های NAS پر می‌شود.

## جزئیات فنی

- فایل‌های جدید: `supabase/functions/_shared/synology-ssh.ts`, `supabase/functions/nas-storage/index.ts`.
- فایل ویرایش‌شده: `src/modules/generator-ui/pages/DashboardPage.tsx` (فقط بخش Storage؛ بقیه‌ی صفحه دست نمی‌خورد).
- thumbnail ویدیوها در این حالت در دسترس نیست؛ به‌جای آن آیکن/فریم پخش نشان داده می‌شود (مثل کارت‌های بدون thumbnail در تصویر شما).
- هیچ تغییری در دیتابیس یا باکت‌های Supabase لازم نیست؛ منطق ساخت ویدیو دست‌نخورده می‌ماند و فقط نمایشگر Storage جابه‌جا می‌شود.

## مراحل اجرا

1. درخواست و ثبت ۴–۵ secret مربوط به NAS.
2. ساخت هلپر SSH و ادج‌فانکشن `nas-storage` و تست اتصال/لیست.
3. بازوصل کردن دیالوگ Storage (لیست، پخش، حذف تکی، حذف گروهی).
4. تست در پیش‌نمایش: باز شدن Storage، نمایش فایل‌های فولدر NAS، پخش یک ویدیو، حذف یک آیتم.
