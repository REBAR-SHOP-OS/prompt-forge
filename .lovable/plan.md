## Goal

روی هر کارت (ویدئو + تصویر) در ستون Recent outputs و همچنین در پیش‌نمایش مرکزی، یک آیکون "Overlay" اضافه شود تا کاربر بتواند:
- چندین **متن** با فونت/رنگ/اندازه/وزن دلخواه روی کارت قرار دهد
- چندین **تصویر** (لوگو، استیکر، …) روی کارت قرار دهد
- هر overlay را با **drag-and-drop آزاد** روی پیش‌نمایش جابجا کند
- این overlay‌ها در پیش‌نمایش کارت + پیش‌نمایش مرکزی نمایش داده شوند **و** هنگام ساخت Final Film روی فریم‌های ویدئو/تصویر **burn** شوند.

## Data model

### دیتابیس — جدول جدید `generator_clip_overlays`

```sql
CREATE TABLE public.generator_clip_overlays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  -- شناسه‌ی کارت میزبان: یا job_id (ویدئو) یا user_image_id (تصویر آپلودی)
  clip_kind text NOT NULL CHECK (clip_kind IN ('video','image')),
  clip_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('text','image')),

  -- مشترک: مختصات نسبی (0..1) و اندازه نسبی به عرض کارت
  x numeric NOT NULL DEFAULT 0.5,    -- مرکز افقی نسبی
  y numeric NOT NULL DEFAULT 0.5,    -- مرکز عمودی نسبی
  scale numeric NOT NULL DEFAULT 0.2, -- نسبت عرض overlay به عرض کارت
  rotation numeric NOT NULL DEFAULT 0,
  z_index integer NOT NULL DEFAULT 0,

  -- متنی
  text_value text,
  font_family text,        -- یکی از پریست‌ها
  font_weight integer,     -- 400/600/800
  color text,              -- HSL یا hex
  bg_color text,           -- hsla یا null
  text_align text,         -- 'left'|'center'|'right'

  -- تصویری
  image_path text,         -- storage path داخل bucket overlay-assets
  image_url text,          -- public URL کش‌شده

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX ON public.generator_clip_overlays (user_id, clip_id) WHERE deleted_at IS NULL;
ALTER TABLE public.generator_clip_overlays ENABLE ROW LEVEL SECURITY;

-- RLS: کاربر CRUD کامل روی overlay های خودش
CREATE POLICY "overlays: users select own" ON public.generator_clip_overlays
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY "overlays: users insert own" ON public.generator_clip_overlays
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "overlays: users update own" ON public.generator_clip_overlays
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### Storage — bucket جدید `overlay-assets` (public)

برای تصاویر آپلودی overlay با policy درون‌فولدری `{user_id}/...` (الگوی همان bucket `user-images`).

## UI changes — `src/modules/generator-ui/pages/DashboardPage.tsx`

### 1. آیکون Overlay روی هر کارت

کنار دکمه‌های موجود (drag handle، trash) یک دکمه با آیکون `Type` (lucide) اضافه می‌شود. کلیک → یک **Popover** کوچک باز می‌کند با محتوای زیر:

- لیست overlay‌های موجود کارت (هر ردیف: thumbnail/متن کوتاه + دکمه delete)
- دکمه‌ی «+ Add text» و «+ Add image»
- وقتی روی یک overlay کلیک می‌شود → فرم ویرایش با کنترل‌ها:
  - برای متن: `<textarea>` متن، `<select>` فونت (پریست: Inter, Vazirmatn, Playfair Display, Roboto Mono, Bebas Neue)، input `type="color"` برای رنگ، `type="color"` برای پس‌زمینه + checkbox شفاف، سه پیل وزن (Light/Regular/Bold)، اسلایدر `scale` (5%..50%)، اسلایدر چرخش (-180..180)
  - برای تصویر: دکمه «Replace image» (آپلود به `overlay-assets`)، اسلایدر scale و rotation

تمام تغییرات با debounce 300ms در `generator_clip_overlays` ذخیره می‌شوند.

### 2. کامپوننت جدید `ClipOverlayLayer`

`src/modules/generator-ui/components/ClipOverlayLayer.tsx` — یک `<div className="absolute inset-0">` که overlay‌ها را به‌صورت absolute رندر می‌کند:

- props: `overlays: ClipOverlay[]`, `editable: boolean`, `onChange(id, patch)`, `onSelect(id)`
- موقعیت‌دهی: `left: x*100% , top: y*100% , transform: translate(-50%,-50%) rotate(...)`
- اندازه‌ی متن/تصویر بر اساس `scale * containerWidth`
- وقتی `editable=true`: pointer events فعال، listener‌های `pointerdown/move/up` برای drag، نوار باریک handle بالای انتخاب‌شده با دکمه‌های resize (گوشه) و چرخش
- در حالت editable=false: `pointer-events-none` تا overlay مزاحم تعامل ویدئو نشود

### 3. ادغام در پیش‌نمایش مرکزی

داخل `previewItem` block (خطوط 2143–2300) یک `<ClipOverlayLayer editable>` روی `<video>`/`<img>` گذاشته می‌شود — کاربر می‌تواند overlay‌ها را همانجا به‌صورت آزاد drag/resize کند و تغییرات بلافاصله در DB ذخیره می‌شوند.

### 4. ادغام در thumbnail کارت‌ها

روی هر کارت در `displayedClips.map` (هم برانچ image هم video) یک `<ClipOverlayLayer editable={false}>` روی thumbnail قرار می‌گیرد تا کاربر پیش‌نمایش کوچک تغییرات را ببیند. drag/edit اینجا غیرفعال است (محدود به preview مرکزی).

### 5. State management

- یک hook جدید `useClipOverlays(userId)` که همه‌ی overlay‌های کاربر را `select` می‌کند و در state نگه می‌دارد + توابع `addOverlay/updateOverlay/deleteOverlay` با optimistic update
- groupBy روی `clip_id` هنگام رندر

### 6. آپلود تصویر overlay

تابع `uploadOverlayImage(file)` که:
1. به `overlay-assets/{userId}/{uuid}-{filename}` آپلود می‌کند
2. `getPublicUrl` می‌گیرد
3. ردیف overlay با `kind='image'`, `image_path`, `image_url` ایجاد می‌کند

## Final Film integration — burn-in

### `src/modules/generator-ui/lib/imageToClip.ts`

تابع `imageUrlToClip` گسترش می‌یابد: پارامتر اختیاری `overlays?: ClipOverlay[]` می‌گیرد و قبل از capture، در حلقه‌ی paint علاوه بر تصویر اصلی، overlay‌ها را روی canvas می‌کشد.

### `src/modules/generator-ui/lib/mergeVideos.ts`

تابع `mergeVideoUrls` یک پارامتر اختیاری جدید می‌گیرد:
```ts
overlaysPerClip?: (ClipOverlay[] | undefined)[]
```

داخل `loopPaint(video)` و `paintTransitionFrame`، بعد از `drawContain`، تابع جدید `paintOverlays(ctx, w, h, overlays)` فراخوانی می‌شود:
- متن: `ctx.font = `${weight} ${px}px ${family}`` ; `fillStyle = color` ; (اختیاری `fillRect` پس‌زمینه) ; `fillText` با چندخطی
- تصویر: تصاویر overlay از قبل با `loadImage` در آرایه‌ی `preloadedOverlayImages` بارگذاری می‌شوند تا رسم سینکرون باشد ; `ctx.drawImage` با ترجمه/چرخش/مقیاس

### تغییر در `handleMergeAllVideos` (خطوط 1621–1755)

- قبل از فراخوانی `mergeVideoUrls`، برای هر clip در `orderedItems` آرایه‌ی overlay‌های مربوطه را از state می‌گیرد و تصاویر overlay را preload می‌کند
- این آرایه به‌عنوان `overlaysPerClip` ارسال می‌شود
- برای کلیپ‌های image-still، overlay‌ها مستقیماً به `imageUrlToClip` منتقل می‌شوند (در همان فراخوانی موجود قبل از upload کلیپ webm)

### CORS

تصاویر overlay از همان bucket Supabase public بارگذاری می‌شوند (`crossOrigin = 'anonymous'`)، که با bucket‌های فعلی project سازگار است و canvas را tainted نمی‌کند.

## فونت‌ها

پنج پریست شروع، که در `index.html` با `<link rel="preconnect">` Google Fonts بارگذاری می‌شوند:
- Inter (پیش‌فرض)
- Vazirmatn (برای فارسی)
- Playfair Display (سریف کلاسیک)
- Roboto Mono (مونو)
- Bebas Neue (نمایشی)

برای canvas: قبل از merge، `await document.fonts.load('700 48px "<family>"')` فراخوانی می‌شود تا فونت در drawing context در دسترس باشد.

## فایل‌های تغییریافته یا جدید

- `supabase/migrations/<ts>_clip_overlays.sql` — جدول + RLS + bucket `overlay-assets` + storage policies
- `src/modules/generator-ui/components/ClipOverlayLayer.tsx` — جدید
- `src/modules/generator-ui/components/OverlayEditorPopover.tsx` — جدید
- `src/modules/generator-ui/lib/overlays.ts` — جدید: type `ClipOverlay`, helpers (`paintOverlays`, `preloadOverlayImages`, hex/hsl utils)
- `src/modules/generator-ui/lib/imageToClip.ts` — افزودن پارامتر overlay
- `src/modules/generator-ui/lib/mergeVideos.ts` — افزودن `overlaysPerClip` + paint داخل loops
- `src/modules/generator-ui/pages/DashboardPage.tsx` — hook، آیکون Popover روی هر کارت، layer روی thumbnail و preview، انتقال overlay‌ها به merge
- `index.html` — تگ‌های Google Fonts برای پریست‌ها

## Out of scope (برای فاز بعد)

- انیمیشن‌های ورود/خروج overlay (fade/slide)
- بازه‌ی زمانی ظاهر/ناپدید شدن overlay در طول کلیپ (الان از اول تا آخر کلیپ نشان داده می‌شود)
- shadow/stroke پیشرفته برای متن (فعلاً فقط رنگ + پس‌زمینه)
- z-order دستی (الان بر اساس ترتیب ساخت)
