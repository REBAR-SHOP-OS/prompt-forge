## Goal
هر بار که کاربر **تازه وارد می‌شود** (event `SIGNED_IN` از Supabase Auth — نه refresh و نه session restore)، داشبورد باید دقیقاً مثل بعد از فشردن «Start Over» نمایش داده شود: composer خالی، history workspace خالی، بدون preview/music/voiceover. Library و فایل‌های ذخیره‌شده روی سرور دست‌نخورده می‌مانند.

## Approach (frontend only)

Refresh نباید پاک کند، پس نمی‌توان فقط روی mount عمل کرد. به‌جایش از یک flag مبتنی بر event `SIGNED_IN` استفاده می‌کنیم.

### 1) ثبت flag در `AuthProvider.tsx`
داخل `onAuthStateChange((event, sess) => ...)`:
- اگر `event === 'SIGNED_IN'` و `sess?.user?.id` موجود است:
  - `localStorage.setItem(`pending-fresh-start:${sess.user.id}`, '1')`

این event در Supabase v2 فقط در ورود واقعی (یا بعد از پاک شدن session) شلیک می‌شود؛ refresh ساده تب باعث آن نمی‌شود (آنجا `INITIAL_SESSION` می‌آید).

### 2) مصرف flag در `DashboardPage.tsx`
- یک `useEffect` با وابستگی `[userId, generatedVideos.length]`:
  - اگر `userId` ست است و `localStorage.getItem(`pending-fresh-start:${userId}`) === '1'`:
    - یک‌بار `handleStartOver()` را اجرا کن (با یک `useRef<boolean>` به نام `freshStartAppliedRef` تا در همان session دوبار اجرا نشود).
    - بعد از اجرا: `localStorage.removeItem(`pending-fresh-start:${userId}`)`.
- اجرای `handleStartOver` بعد از اولین لود jobs انجام می‌شود تا تمام jobهای فعلی به `workspaceHiddenJobIds` اضافه و workspace خالی شود (دقیقاً همان منطق فعلی Start Over).

### 3) رفتار signOut
بعد از `signOut`، session پاک می‌شود؛ ورود بعدی دوباره `SIGNED_IN` می‌فرستد و چرخه تکرار می‌شود. نیاز به تغییر اضافه نیست.

## Out of scope
- بدون تغییر در DB، RLS، edge functions، یا Library/تاریخچه‌ی دائمی.
- بدون پاک کردن فایل‌ها از storage.
- بدون تغییر در رفتار refresh/تب جدید با session موجود.

## Verification
1. Sign in → داشبورد کاملاً خالی (هیچ history، composer reset، حالت "Start forging a prompt"). ✓
2. ساخت چند ویدیو → refresh تب → state حفظ می‌شود (refresh نباید پاک کند). ✓
3. Sign out → Sign in دوباره → باز هم خالی. ✓
4. Library (Final Film outputs) دست‌نخورده می‌ماند. ✓
