## هدف

پاکسازی فایل‌های مرده/شیم در ریپو **بدون هیچ تغییر رفتاری**. وضعیت فعلی پروژه (Dashboard، منطق Start-only/End-only/both، احراز هویت، شماره‌گذاری کارت‌ها) به‌عنوان baseline ثابت می‌ماند و نقاط ورود فعلی (`src/main.tsx` → `src/App.tsx` → `AuthProvider` + `LoginPage`/`DashboardPage`) دست‌نخورده باقی می‌مانند.

## فایل‌هایی که حذف می‌شوند

پس از بررسی ارجاعات (هیچ مصرف‌کننده‌ی فعالی ندارند):

**شیم‌های قدیمی (re-export فقط):**
- `src/context/AuthProvider.tsx` — شیم به `@/core/auth/AuthProvider`، صفر مصرف‌کننده.
- `src/components/system/LoadingScreen.tsx` — شیم به `@/core/ui/LoadingScreen`، صفر مصرف‌کننده.
- `src/components/system/UserBadge.tsx` — شیم به `@/core/ui/UserBadge`، صفر مصرف‌کننده.
- `src/routes/ProtectedRoute.tsx` — شیم، صفر مصرف‌کننده.
- `src/routes/AdminRoute.tsx` — شیم، صفر مصرف‌کننده.
- `src/pages/admin/AdminPage.tsx` — شیم، صفر مصرف‌کننده.
- `src/pages/app/DashboardPage.tsx` — شیم، صفر مصرف‌کننده (App.tsx مستقیم از ماژول import می‌کند).

**صفحات/کامپوننت‌های یتیم:**
- `src/pages/auth/SignupPage.tsx` — هیچ مسیری به آن وصل نیست.
- `src/pages/auth/LoginPage.tsx` — استفاده می‌شود توسط App.tsx، **نگه داشته می‌شود** (اصلاح: import داخلی به AuthForm حذف می‌شود فقط اگر AuthForm حذف شود — جزئیات پایین).
- `src/pages/Index.tsx` — placeholder بدون router مصرف‌کننده.
- `src/pages/NotFound.tsx` — هیچ router فعالی، صفر مصرف‌کننده.
- `src/pages/system/UnauthorizedPage.tsx` — صفر مصرف‌کننده.
- `src/layouts/AppShell.tsx` — صفر مصرف‌کننده.
- `src/components/NavLink.tsx` — صفر مصرف‌کننده.
- `src/core/migration/cutover.ts` — فقط داخل خودش استفاده می‌شود، صفر مصرف‌کننده‌ی خارجی.

**کامپوننت‌های ماژول بلااستفاده:**
- `src/modules/generator-ui/components/GenerateVideoCard.tsx` — صفر مصرف‌کننده (DashboardPage از آن استفاده نمی‌کند).
- `src/modules/generator-ui/components/RoutePreviewCard.tsx` — صفر مصرف‌کننده.

**نکته درباره `AuthForm` و `LoginPage/SignupPage`:**
- `LoginPage` در App.tsx استفاده می‌شود → نگه داشته می‌شود.
- `SignupPage` بلااستفاده است → حذف می‌شود.
- `AuthForm` فقط توسط `LoginPage` و `SignupPage` استفاده می‌شود؛ پس از حذف SignupPage، `AuthForm` همچنان توسط LoginPage مصرف می‌شود → **نگه داشته می‌شود**.

**نکته درباره `src/lib/api.ts`:**
- شیم با ۱۷ ارجاع (احتمالاً غیرمستقیم در ماژول‌های backend). با توجه به ریسک، **نگه داشته می‌شود** در این پاکسازی.

## فایل‌هایی که دست‌نخورده می‌مانند

- `src/App.tsx`, `src/main.tsx`
- `src/core/**` (به جز `migration/cutover.ts`)
- `src/modules/generator-ui/pages/DashboardPage.tsx` و libهای آن (`mergeVideos`, `imageToClip`, `proxiedVideoUrl`, `WelcomeVideoOverlay`)
- `src/modules/job-orchestrator/**`
- `src/integrations/supabase/**`
- تمام `src/components/ui/**` (shadcn)
- تمام edge functions در `supabase/functions/**`
- `supabase/config.toml`
- ماژول‌های backend دیگر (`admin-monitor`, `credit-management`, `video-library`, `external-api-adapter`) — حتی اگر در UI فعلی استفاده نمی‌شوند، بک‌اند آن‌ها فعال است؛ طبق پاسخ شما (صفر تغییر رفتاری) دست‌نخورده می‌مانند.

## مراحل اجرا

1. حذف ۱۵ فایل مرده‌ی فهرست‌شده‌ی بالا با `rm`.
2. اجرای جستجوی نهایی برای اطمینان از عدم وجود import شکسته (`rg "context/AuthProvider|components/system|routes/Protected|routes/Admin|pages/admin/AdminPage|pages/app/DashboardPage|pages/Index|pages/NotFound|pages/system/Unauthorized|layouts/AppShell|components/NavLink|migration/cutover|GenerateVideoCard|RoutePreviewCard|pages/auth/SignupPage" src/`).
3. اگر هر import شکسته‌ای پیدا شد، فایل را برمی‌گردانیم (rollback ایمن).
4. هیچ تغییری در فایل‌های باقیمانده اعمال نمی‌شود.

## ریسک و ایمنی

- **ریسک رفتاری: صفر** — تمام فایل‌های حذف‌شده هیچ مصرف‌کننده‌ی فعالی ندارند (تأیید شده با `rg`).
- **ریسک build: صفر** — TypeScript بعد از حذف خطایی نخواهد داد چون چیزی به این فایل‌ها import نمی‌کند.
- اگر لازم شد بازگرداندن، از History پروژه استفاده می‌شود.

## خروجی نهایی

ریپوی تمیزتر با ~۱۵ فایل کمتر، رفتار اپ ۱۰۰٪ یکسان با وضعیت فعلی baseline.
