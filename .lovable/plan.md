## Goal
حذف کامل ویدئوی معرفی (intro/welcome) که هنگام ورود به داشبورد با دکمه "Skip" نمایش داده می‌شود.

## وضعیت فعلی
- ویدئوی نمایش‌داده‌شده در تصویر، کامپوننت `WelcomeVideoOverlay` است که در `DashboardPage.tsx` رندر می‌شود.
- کامپوننت `src/components/intro/LoginIntro.tsx` در هیچ جای پروژه استفاده نمی‌شود (کد مرده).

## تغییرات

### 1. `src/modules/generator-ui/pages/DashboardPage.tsx`
- حذف import مربوط به `WelcomeVideoOverlay` (خط ~87).
- حذف state و منطق `showWelcome` / `dismissWelcome` و افکت مربوط به `welcome_seen_*` (خطوط ~810-825).
- حذف رندر `{showWelcome && <WelcomeVideoOverlay ... />}` (خط ~4919).

### 2. فایل‌های بلااستفاده
- حذف `src/modules/generator-ui/components/WelcomeVideoOverlay.tsx`.
- حذف `src/components/intro/LoginIntro.tsx` (کد مرده، استفاده‌نشده).
- پاک‌سازی خط `sessionStorage.removeItem("intro_played")` در `AuthForm.tsx` (دیگر کاربرد ندارد).

## نتیجه
پس از ورود، هیچ ویدئوی معرفی‌ای نمایش داده نمی‌شود و کاربر مستقیم وارد داشبورد می‌شود. فایل ویدئو در `public/intro/welcome.mp4` می‌تواند نگه‌داری شود (ارجاعی به آن باقی نمی‌ماند).