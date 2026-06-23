## نمایش کاراکتر شیت انتخاب‌شده در پنل Continuity Mode

### مشکل فعلی
وقتی Continuity Mode فعال می‌شود، ردیف «Character / reference» همیشه «No reference selected» نشان می‌دهد — حتی اگر آن فیلم با یک کاراکتر شیت ساخته شده باشد. علت: این پنل فقط به state موقت `selectedCharacter` نگاه می‌کند، و این state هنگام باز شدن پروژه/کلیپ موجود ریست می‌شود (`setSelectedCharacter(null)`). کاراکتر استفاده‌شده در ساخت کلیپ روی ردیف job ذخیره نمی‌شود، بنابراین هیچ مرجع پایداری برای نمایش وجود ندارد.

### هدف
وقتی این آیکون/سوییچ زده می‌شود و پنل Continuity باز می‌شود، کاراکتر شیتی که برای آن فیلم انتخاب شده بود در ردیف Character / reference نمایش داده شود تا فیلم بعدی بر اساس همان شخصیت ساخته شود. کاملاً اختیاری و فقط frontend، بدون تغییر دیتابیس/ادج‌فانکشن.

### راهکار امن و کم‌ریسک
کاراکتر انتخاب‌شده را به‌صورت پایدار در همان state زنجیره‌ای Continuity (همان localStorage موجود `generator:continuity:<chainId>`) ذخیره می‌کنیم — دقیقاً مثل scene memory. به این ترتیب حتی پس از ریست شدن `selectedCharacter` یا بازگشت به پروژه، مرجع کاراکتر باقی می‌ماند.

#### ۱) گسترش `src/modules/generator-ui/lib/continuity.ts`
- افزودن فیلد اختیاری `character` به `ContinuityState`:
  ```ts
  characterRef?: { id: string; url: string; title: string | null } | null
  ```
- مقدار پیش‌فرض `null` و خواندن/نوشتن امن در `loadContinuity`/`saveContinuity` (با fallback روی null هنگام نبود مقدار).

#### ۲) ذخیره کاراکتر در زمان درست (`DashboardPage.tsx`)
- هنگام انتخاب کاراکتر (مسیرهای `setSelectedCharacter` در دیالوگ Character Sheet و منوی پروژه) و هنگام ساخت کلیپ با کاراکتر، علاوه بر state فعلی، مرجع کاراکتر در `updateContinuity({ characterRef })` نیز ذخیره شود.
- هنگام فعال‌سازی Continuity (`handleToggleContinuity`)، اگر `selectedCharacter` موجود است همان را در `characterRef` ست کن؛ و اگر scene memory خالی است، فیلد `character` متن مموری از توضیح کاراکتر (`resolveCharacterDescription`) به‌عنوان starter پر شود تا فیلم بعدی واقعاً بر پایه آن شخصیت ساخته شود.

#### ۳) نمایش در پنل (`DashboardPage.tsx`، ردیف Character / reference حدود خط ۱۰۳۰۵)
- منبع نمایش را از `selectedCharacter` به مقدار مؤثر تغییر بده:
  ```ts
  const continuityCharacter = selectedCharacter ?? continuity.characterRef ?? null
  ```
- اگر `continuityCharacter` موجود بود، تصویر بندانگشتی + عنوان نمایش داده شود؛ در غیر این صورت همان حالت «No reference selected» و پیام راهنما باقی بماند.
- اگر کاراکتر از `continuity.characterRef` آمده ولی `selectedCharacter` خالی است، با کلیک روی ردیف، `selectedCharacter` با همان مقدار ست شود تا فیلم بعدی قطعاً از آن استفاده کند (هم‌سو شدن state موقت با مرجع پایدار).

#### ۴) استفاده در پرامپت فیلم بعدی
- در مسیر `handleSubmit`، منطق فعلی تزریق کاراکتر (`applyCharacterPrefix` + `resolveCharacterDescription`) از `selectedCharacter` استفاده می‌کند. با هم‌سو شدن `selectedCharacter` با `characterRef` در مرحله ۳، فیلم بعدی به‌صورت خودکار بر اساس همان کاراکتر شیت ساخته می‌شود؛ تغییر منطق سرور لازم نیست.

### خارج از محدوده (دست‌نخورده)
بدون تغییر دیتابیس/اسکیم، بدون تغییر ادج‌فانکشن یا قرارداد `createJob`، رفتار فعلی final-frame حفظ می‌شود، Continuity همچنان اختیاری و پیش‌فرض خاموش است.

### اعتبارسنجی
- فعال کردن Continuity روی فیلمی که با کاراکتر شیت ساخته شده → نمایش تصویر و نام همان کاراکتر در ردیف Character / reference.
- بستن و بازکردن دوباره پروژه → مرجع کاراکتر همچنان نمایش داده می‌شود (پایداری localStorage).
- ساخت فیلم بعدی → پرامپت شامل توضیح همان کاراکتر است.
- نبود کاراکتر → همان پیام راهنمای قبلی.
- Typecheck/build سالم.