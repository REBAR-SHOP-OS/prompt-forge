# همگام‌سازی کامل کتابخانه با بک‌اند

## مشکل (علت ریشه‌ای)
ویدیوها و jobها در بک‌اند ذخیره می‌شوند، اما کل «چینش و سازماندهی کتابخانه» فقط در `localStorage` مرورگر و با کلید کاربر نگه‌داری می‌شود. در `DashboardPage.tsx` بیش از ۲۰ کلید محلی وجود دارد، از جمله:

- `library-saved-jobs:{userId}` → بخش **Final Videos**
- `draft-entries:{userId}`, `draft-source-jobs`, `draft-source-images`, `active-draft-id` → **Drafts**
- `project-cover-images`, `job-draft-map`, `image-draft-map`
- `approved-videos`, `merged-videos`, `workspace-hidden-jobs/images`, `workspace-active-jobs/images`, `deleted-draft-ids`, `pending-end-appends/start-prepends`, `project-source-jobs/images`, `project-audio`, `selected-project`, `preview-state`

به همین دلیل در مرورگر ناشناس (localStorage خالی) بخش Final Videos خالی است و Drafts فقط از روی jobهای خام بازسازی می‌شود و بهم‌ریخته دیده می‌شود؛ اما در مرورگر عادی که این کلیدها قبلاً ذخیره شده‌اند درست است. یعنی کتابخانه بین دستگاه‌ها/مرورگرها همگام نیست.

## راه‌حل
این «وضعیت چینش کتابخانه» در دیتابیس ذخیره شود تا روی هر دستگاه/مرورگر یکسان بارگیری شود. به‌جای مهاجرت تک‌تک ۲۰ کلید، یک سند JSON واحد per-user نگه می‌داریم که آینهٔ همین کلیدهاست. `localStorage` به‌عنوان کش سریع باقی می‌ماند، اما منبع حقیقت سرور است.

این رویکرد کم‌ریسک است: منطق رندر فعلی و jobهای بک‌اند دست نمی‌خورند؛ فقط لایهٔ ذخیره/بارگیری همین stateها سرور-محور می‌شود.

## مراحل

### ۱) جدول بک‌اند (migration)
ساخت جدول `generator_library_state`:
- `user_id uuid PRIMARY KEY` (ارجاع به auth.users)
- `state jsonb NOT NULL DEFAULT '{}'` → کل نگاشت کلید→مقدار
- `version int NOT NULL DEFAULT 0` → برای جلوگیری از overwrite قدیمی/کنترل همزمانی
- `updated_at timestamptz`
- GRANT برای `authenticated` و `service_role`؛ RLS فقط روی ردیف خودِ کاربر (`auth.uid() = user_id`)؛ تریگر `set_updated_at`.

### ۲) گیت‌وی/خواندن‌نوشتن
- استفاده از همان کلاینت Supabase موجود (`@/integrations/supabase/client`) برای `select`/`upsert` روی این جدول (با RLS امن است؛ نیازی به edge function جدید نیست).
- افزودن یک هوک کوچک `useLibraryState(userId)` در `src/modules/generator-ui/lib/`:
  - **بارگیری**: هنگام ورود، ابتدا state سرور را می‌گیرد. اگر سرور خالی بود ولی localStorage داده داشت → یک‌بار مهاجرت (push به سرور). سپس localStorage را از روی state سرور هیدریت می‌کند تا نمایش یکسان شود.
  - **ذخیره**: یک تابع `persist(key, value)` که هم localStorage را آپدیت می‌کند و هم با debounce (مثلاً ۸۰۰ms) کل سند را به سرور `upsert` می‌کند (افزایش `version`).

### ۳) اتصال در DashboardPage
- توابع موجود `persistLibrarySavedJobs`, `persistDraftEntries`, `persistCoverImages` و سایر `setItem`ها به‌جای نوشتن مستقیم در localStorage، از `persist(key, value)` هوک استفاده کنند (تغییر نقطه‌ای، بدون تغییر منطق رندر).
- خواندن اولیهٔ هر state از مقدار هیدریت‌شدهٔ هوک خوانده شود.
- کلیدهای صرفاً مخصوص دستگاه (`generator:aspectRatio`, `generator:clipAspectRatios`, `generator:lockedProjectRatio`, `ui:preferred-model`) **محلی** می‌مانند و همگام نمی‌شوند (ترجیح هر دستگاه).

### ۴) حالت خالی تمیز
وقتی نه سرور و نه localStorage داده دارند (کاربر کاملاً جدید)، Drafts/Final Videos به‌جای نمایش بهم‌ریخته، خالیِ تمیز نشان داده شوند (بازسازی محتاطانه از jobها فقط وقتی متادیتای معتبر هست).

## بخش فنی
- منبع حقیقت: جدول `generator_library_state` (یک ردیف per-user، ستون `jsonb`).
- همگام‌سازی: load-on-login + upsert با debounce روی هر تغییر؛ کنترل نسخه با `version` برای جلوگیری از بازنویسی توسط تب قدیمی.
- سازگاری عقب‌رو: مهاجرت یک‌بارهٔ localStorage موجود به سرور تا کاربران فعلی داده‌شان را از دست ندهند.
- امنیت: RLS محدود به `auth.uid() = user_id`؛ بدون دسترسی anon.
- بدون تغییر در jobها، ویدیوها، کردیت‌ها یا منطق رندر فعلی — صرفاً لایهٔ persistence.

## خارج از دامنه
- تغییر در ساختار jobها/asssetها یا فلو ساخت ویدیو.
- همگام‌سازی ترجیحات مخصوص دستگاه (aspect ratio/مدل).
