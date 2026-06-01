علت اصلی‌ای که از کد مشخص شد این است که Final Film به‌عنوان «پروژه‌ی واقعیِ پایدار» در دیتابیس ذخیره نمی‌شود؛ بخش مهمی از Library فعلاً روی localStorage و URLهای کش‌شده تکیه دارد.

## علت دقیق مشکل

1. **کارت‌های Final Film فقط محلی ذخیره می‌شوند**
   - خروجی Final Film در storage آپلود می‌شود، اما خودِ رکورد Library/project با idهایی مثل `merged-*` در `localStorage` ذخیره می‌شود (`merged-videos:${userId}`، `project-source-jobs:${userId}` و …).
   - یعنی بعد از sign out، تغییر مرورگر، پاک‌شدن storage مرورگر، یا گذشت زمان، پروژه دیگر یک منبع قطعی backend ندارد.

2. **URL پخش ویدئو با token قدیمی cache می‌شود**
   - `usePlayableVideoUrl` آدرس proxied ویدئو را به‌صورت سراسری cache می‌کند.
   - این آدرس داخل query خودش access token دارد.
   - بعد از گذشت زمان یا sign out/sign in، token قبلی منقضی می‌شود ولی cache همچنان همان URL قدیمی را برمی‌گرداند؛ در نتیجه `video-proxy` پاسخ 401/خطا می‌دهد و کارت به‌صورت خاکستری/خالی دیده می‌شود.
   - retry فعلی فقط `_r=` اضافه می‌کند، اما URL اصلی همچنان با token مرده است؛ پس مشکل ریشه‌ای حل نمی‌شود.

3. **Source clipهای داخل پروژه ممکن است URL موقت provider داشته باشند**
   - هنگام Final Film تلاش می‌شود source clipها به bucket داخلی کپی شوند، اما این مرحله `best-effort` است: اگر کپی fail شود، سیستم بی‌صدا همان URL اصلی provider را نگه می‌دارد.
   - URLهای provider بعد از مدتی expire می‌شوند؛ بنابراین وقتی پروژه را بعداً باز می‌کنی، source cardهای داخل پروژه ممکن است دیگر قابل پخش نباشند.

## برنامه‌ی اصلاح ریشه‌ای

### 1. حذف وابستگی حیاتی Library به localStorage
- یک ذخیره‌سازی پایدار برای پروژه‌های Library در backend اضافه می‌کنم:
  - Final Film entry
  - aspect ratio انتخاب‌شده
  - آدرس ویدئوی final
  - لیست source clipها/images با ترتیب دقیق
  - thumbnail/cover و metadata لازم
- RLS/permissionها owner-scoped می‌شوند تا هر کاربر فقط پروژه‌های خودش را ببیند.
- localStorage فقط cache کمکی می‌ماند، نه منبع حقیقت.

### 2. اضافه‌کردن API پایدار برای Library projects
- endpoint/gateway برای این عملیات اضافه می‌شود:
  - `listLibraryProjects`
  - `saveLibraryProject`
  - `deleteLibraryProject`
- Dashboard هنگام load اول از backend پروژه‌ها را می‌خواند و بعد localStorage را فقط برای compatibility/backfill استفاده می‌کند.

### 3. اصلاح Final Film commit flow
- بعد از ساخت Final Film، پروژه فقط وقتی به Library اضافه می‌شود که metadata آن در backend ذخیره شده باشد.
- اگر source snapshot باید کپی شود، دیگر خطای آن بی‌صدا بلعیده نمی‌شود؛ یا نسخه‌ی پایدار ساخته می‌شود، یا UI با fallback سالم Final Film باز می‌شود و کارت خالی نمایش داده نمی‌شود.

### 4. اصلاح cache و lifecycle پخش ویدئو
- `usePlayableVideoUrl` طوری اصلاح می‌شود که URLهای proxy شامل token قدیمی را دائمی cache نکند.
- cache با تغییر auth/session پاک یا re-resolve می‌شود.
- هنگام error پخش، به‌جای retry روی همان URL خراب، cache invalidate می‌شود و URL تازه با token تازه ساخته می‌شود.
- `PlayableVideo` با تغییر source/session دوباره mount/initialize می‌شود تا کارت بعد از sign out/sign in روی پلیر قدیمی گیر نکند.

### 5. fallback امن برای پروژه‌های قدیمی
- پروژه‌هایی که قبلاً فقط در localStorage ذخیره شده‌اند، در اولین load تا حد امکان به backend migrate/backfill می‌شوند.
- اگر source clip قدیمی expire شده باشد، کارت پروژه نباید blank بماند؛ حداقل final merged video یا cover/placeholder کنترل‌شده نمایش داده می‌شود.

### 6. تست و اعتبارسنجی
- تست می‌کنم که:
  - Final Film جدید بعد از refresh همچنان در Library و داخل پروژه پخش شود.
  - بعد از sign out/sign in، cache ویدئو با token جدید ساخته شود و کارت blank نشود.
  - بازکردن پروژه‌ی Final Film، source clipها را با ترتیب درست نشان دهد.
  - اگر یک URL قدیمی provider خراب/expired بود، UI به کارت خالی یا ویدئوی 0:00 تبدیل نشود.
  - aspect ratio همان مقدار ذخیره‌شده باقی بماند و به 16:9 برنگردد.