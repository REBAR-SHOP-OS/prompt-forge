## هدف

۱) نریشن سناریوها همیشه مرتبط با محصول انتخابی کاربر باشد.
۲) یک بخش «اطلاعات کسب‌وکار» اضافه شود که کاربر در آن توضیح می‌دهد بیزنسش چیست. این بخش **اجباری** است و تا پر نشود سناریو ساخته نمی‌شود. مقدار آن **برای همیشه روی حساب کاربر** ذخیره می‌شود و دفعات بعد خودکار پر می‌شود. این الزام در **همهٔ حالت‌ها** (تبلیغ محصول، کاراکتر، و سناریونویس عمومی) اعمال می‌شود.

---

## ۱. دیتابیس (migration)

جدول جدید برای نگه‌داری اطلاعات بیزنس هر کاربر:

```text
public.generator_business_profiles
  user_id     uuid  PK  → auth.users(id) on delete cascade
  business_info text   not null
  updated_at  timestamptz not null default now()
```

- ترتیب لازم: CREATE TABLE → GRANT → ENABLE RLS → POLICY.
- GRANT: `SELECT, INSERT, UPDATE, DELETE` به `authenticated`؛ `ALL` به `service_role`. (بدون anon)
- پالیسی‌ها فقط روی ردیف خود کاربر: `auth.uid() = user_id` برای select/insert/update/delete.
- تریگر `set_updated_at` (موجود است) روی این جدول برای به‌روزرسانی `updated_at`.

## ۲. فرانت‌اند — `ProductAdDialog.tsx`

- state جدید: `businessInfo`, `businessLoaded`, `businessSaving`.
- هنگام باز شدن دیالوگ (و وجود `userId`): مقدار `business_info` از جدول خوانده و در فیلد ریخته شود (auto-fill).
- یک بخش/فیلد جدید «اطلاعات کسب‌وکار شما» (Textarea) با برچسب اجباری در بالای فرم، با متن راهنما (مثلاً: نوع بیزنس، محصولات/خدمات، مخاطب هدف، لحن برند). ترجمه برای پنج زبان موجود (en/fa/ar/tr/es/fr) اضافه شود.
- `canGenerate` فقط زمانی true شود که `businessInfo.trim()` خالی نباشد (علاوه بر شرط‌های فعلی). اگر خالی باشد، پیام خطای واضح نمایش داده شود و سناریو ساخته نشود.
- در `generate()`:
  - اگر `businessInfo.trim()` خالی است → خطا و return.
  - قبل از ارسال، مقدار را در جدول ذخیره/به‌روزرسانی کند (upsert با `user_id`).
  - `businessInfo` به بدنهٔ `supabase.functions.invoke('scenario-write')` افزوده شود.

## ۳. فرانت‌اند — `ScenarioWriterDialog.tsx`

همان الگو: فیلد اجباری «اطلاعات کسب‌وکار» با auto-fill از همان جدول، گیت‌کردن `canGenerate`/`generate`، upsert ذخیره، و ارسال `businessInfo` در بدنهٔ درخواست.

## ۴. Edge function — `scenario-write/index.ts`

- خواندن و محدودسازی `businessInfo` از body: `clip(body?.businessInfo, 2000)`.
- اعتبارسنجی: اگر `businessInfo` خالی بود، پاسخ `400` با پیام روشن («اطلاعات کسب‌وکار الزامی است») برگردانده شود تا سرور هم تضمین‌کنندهٔ این قانون باشد (نه فقط UI).
- در `buildSystemPrompt`: یک خط ثابت اضافه شود که به مدل می‌گوید نریشن/دیالوگ و کل سناریو باید کاملاً مرتبط با این کسب‌وکار و با **محصول انتخابی کاربر** باشد و از آن خارج نشود:
  - «Business context: {businessInfo}. Every narration line and the whole scenario MUST stay relevant to this business and promote the user's selected product; do not drift to unrelated topics.»
- تقویت خط محصول موجود تا نریشن صراحتاً پیرامون نام/توضیح محصول باشد.

## ۵. تأیید

- اجرای دیالوگ در preview با Playwright: خالی‌بودن فیلد → دکمه غیرفعال/خطا و عدم ساخت سناریو؛ پرکردن → ذخیره و ساخت سناریو.
- تست edge function با `curl_edge_functions`: بدون `businessInfo` → 400؛ با مقدار → سناریوی مرتبط.
- بستن و بازکردن دوبارهٔ دیالوگ → فیلد به‌صورت خودکار از حساب کاربر پر شود.

### نکات فنی
- استفاده از `supabase.from('generator_business_profiles').upsert(...)` با `onConflict: 'user_id'`.
- بایندینگ کلاینت طبق قرارداد پروژه: مستقیماً `supabase.from(...)`؛ بدون detach کردن متد.
