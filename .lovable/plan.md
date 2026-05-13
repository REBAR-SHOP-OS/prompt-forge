## Root cause
`jobs-create` فقط آدرس‌هایی را برای `firstFrameUrl`/`lastFrameUrl` می‌پذیرد که از باکت عمومی `wan-frames/{userId}/...` باشند (در `supabase/functions/_shared/modules/job-orchestrator/gateway.ts` خط ۶۵).

عکس‌های تولیدشده با AI در `AiImageDialog` در باکت `user-images` آپلود می‌شوند (برای کتابخانه و جدول `generator_user_images`)، و سپس در `DashboardPage` (خط ۲۵۸۹–۲۶۰۶) همین `row.storage_path` (که آدرس `user-images` است) به‌عنوان Start frame ست می‌شود. در نتیجه validator با `INVALID_FIRST_FRAME_URL: firstFrameUrl must point to your own public wan-frames upload` رد می‌کند.

همین مشکل برای «Use this image» از کتابخانه (history روی پنل سمت راست) و reuse عکس‌های قبلی هم می‌تواند رخ بدهد، چون آن‌ها هم در `user-images` هستند.

## Fix (frontend only — minimal & non-destructive)

تابعی در `DashboardPage.tsx` به نام `materializeAsFrame(publicUrl: string, target: 'Start'|'End'): Promise<string>`:

1. اگر `publicUrl` قبلاً به مسیر `/storage/v1/object/public/wan-frames/{userId}/` اشاره می‌کند → بدون تغییر برگردد.
2. در غیر این صورت:
   - `fetch(publicUrl)` → `blob()` (همان عکس را می‌خوانیم؛ باکت `user-images` عمومی است).
   - آپلود به `wan-frames/{userId}/{target}-ai-{Date.now()}-{uuid}.png` با `supabase.storage.from('wan-frames').upload(...)`.
   - گرفتن `getPublicUrl` و برگرداندن آن.
   - در صورت خطا، خطا را پروپاگیت کن تا چیپ مربوطه به وضعیت `failed` با پیام «Could not stage image as frame» برود.

### نقاط فراخوانی
1. **`AiImageDialog.onSaved`** (~خط ۲۵۸۹): چیپ را با `status: 'uploading'` اضافه کن، سپس `materializeAsFrame(row.storage_path, 'Start')` را صدا بزن، و در نهایت `url` چیپ را با URL برگشتی به‌روزرسانی کن (`status: 'ready'`).
2. **هر جای دیگری که از کتابخانه‌ی `user-images` به Start/End ست می‌شود** (مثلاً `Use as Start` از history یا reuse عکس کاربر) — همان تابع را اعمال کن. (یک گذر سریع روی موارد `setUploadedFiles({ target: 'Start'/'End', url: <user-images url> })` و `addUserImageAsStart` و مشابه‌ها انجام شود.)

## Out of scope
- بدون تغییر در باکت‌ها، migrationها، RLS، edge functions، یا validator. (تغییر whitelist برای پذیرش `user-images` اشتباه است: `user-images` غیرعمومی/با scope متفاوت می‌تواند باشد و سمت provider خارجی نیاز به URL پایدار `wan-frames` داریم.)
- بدون تغییر در `generator_user_images` یا کتابخانه؛ ردیف کتابخانه همچنان به `user-images` اشاره می‌کند تا کتابخانه دست‌نخورده بماند.

## Verification
1. تولید عکس AI → Use this image → Apply → ساخت ویدیو ⇒ بدون خطای `INVALID_FIRST_FRAME_URL`.
2. عکس از history (که قبلاً در `user-images` ذخیره شده) → Use as Start ⇒ ساخت ویدیو موفق.
3. آپلود مستقیم عکس کاربر (مسیر معمولی wan-frames) ⇒ بدون regression.
4. End frame هم با همان مسیر تست شود.
