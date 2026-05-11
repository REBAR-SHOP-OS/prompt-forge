## هدف

هر بار که کاربر وارد `/app` می‌شود، صفحه باید کاملاً خالی باشد (مثل اسکرین‌شات سوم: «No renders yet»، بدون preview، بدون کارت). داده‌های قبلی در دیتابیس **حفظ** می‌شوند و فقط از نمایش اولیه کنار گذاشته می‌شوند.

## رفتار جدید

- ورود اولیه → ستون History خالی، Preview خالی، composer ریست (مثل اسکرین‌شات ۳).
- رندرها/آپلودهای ساخته‌شده در همین session، طبق روال در History ظاهر می‌شوند.
- بستن tab یا logout/login مجدد → دوباره صفحه خالی (چون فقط in-session نمایش داده می‌شوند).
- داده‌ها در `generator_generation_jobs`، `generator_video_assets`، `generator_user_images` دست‌نخورده باقی می‌مانند.

## تغییرات کد — فقط Frontend

**`src/modules/generator-ui/pages/DashboardPage.tsx`**

1. در `useEffect` بارگذاری اولیه (خط ~1099–1138) که `jobOrchestratorGateway.listMyJobs()` را صدا می‌زند:
   - فراخوانی API حذف شود (یا فقط زمانی اجرا شود که کاربر صراحتاً «refresh» بزند).
   - به‌جای آن `setGeneratedVideos([])` و `setIsLibraryLoading(false)` ست شود.
2. مشابه برای hydration تصاویر کاربر (خط ~1140 «Hydrate user-uploaded images»): فراخوانی اولیه حذف شود و state تصاویر خالی شروع شود.
3. State مربوط به preview/active job/visible videos که از روی داده‌های لود شده مقداردهی می‌شوند، چون آرایه خالی است، طبیعتاً به حالت empty می‌روند → بدون تغییر اضافی، صفحه دقیقاً مثل اسکرین‌شات ۳ می‌شود.
4. منطق ساخت/آپلود فعلی دست‌نخورده می‌ماند، پس آیتم‌های جدید همان‌طور که الان به History اضافه می‌شوند، اضافه خواهند شد.

## خارج از scope

- بدون تغییر در backend، RLS، RPC ها، یا edge functions.
- بدون حذف داده‌های دیتابیس یا storage.
- بدون تغییر در auth / intro video / dialogها.

## تأیید

- Login → صفحه دقیقاً مثل اسکرین‌شات ۳ (History: «No renders yet»، preview: «Start forging a prompt»).
- ساخت یک ویدیو جدید → کارت در History ظاهر می‌شود.
- Refresh صفحه یا logout/login → دوباره خالی، اما داده‌ها در دیتابیس باقی هستند (با کوئری مستقیم قابل تأیید).
