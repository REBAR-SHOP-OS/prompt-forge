## نتیجه‌ی مورد انتظار
بعد از اصلاح، انتخاب **Google Veo 3 Fast** برای خروجی‌های 10s/15s دیگر با خطای provider شکست نمی‌خورد. اگر درخواست واقعاً به extension یا last-frame interpolation نیاز داشته باشد، backend به‌صورت خودکار مدل سازگار Veo 3.1 را انتخاب می‌کند؛ برای کلیپ‌های کوتاه بدون نیاز خاص، Fast همچنان استفاده می‌شود.

## یافته‌ی ریشه‌ای
- Job خراب اخیر در دیتابیس با `requested_duration = 15` و `model_key = veo-3.0-fast-generate-001` ساخته شده است.
- همان job state نشان می‌دهد `targetDuration = 16` بوده، یعنی سیستم قصد extension داشته است.
- `veo-3.0-fast-generate-001` برای extension مناسب نیست؛ بنابراین مسیر 15s با Fast وارد مدل اشتباه می‌شود و در poll/extension به شکست می‌رسد.
- علت در `resolveVeoModel` است: فقط وجود `lastFrame` را دلیل انتخاب Veo 3.1 می‌داند، اما duration بالای 8s را لحاظ نمی‌کند.

## تغییرات پیشنهادی
1. در `supabase/functions/_shared/modules/external-api-adapter/service.ts` منطق انتخاب مدل را اصلاح می‌کنم:
   - `flow-video-1` + duration `> 8` → `veo-3.1-generate-preview`
   - `flow-video-1` + `lastFrame` → `veo-3.1-generate-preview`
   - `flow-video-1` برای کلیپ‌های 5s/8s بدون lastFrame → `veo-3.0-fast-generate-001`
   - `flow-video-1-pro` همیشه → `veo-3.1-generate-preview`

2. یک guard دفاعی در `startVeo` اضافه می‌کنم تا حتی اگر route قدیمی/اشتباه یا job قدیمی با مدل Fast وارد مسیر extension شد، قبل از ارسال درخواست extension مدل را به Veo 3.1 ارتقا دهد. این باعث می‌شود fix فقط به route preview وابسته نباشد.

3. قرارداد/کامنت‌های مرتبط را دقیق می‌کنم تا مشخص باشد duration بالای 8 ثانیه هم مثل last-frame نیازمند Veo 3.1 است.

4. تست می‌کنم:
   - route/create برای Image-to-Video با `requestedModel: flow-video-1` و `durationSeconds: 15` باید `resolvedModel: veo-3.1-generate-preview` بدهد.
   - کلیپ 5s با همان مدل باید همچنان Fast بماند.
   - edge function مربوطه را deploy و با درخواست واقعی/سبک تست می‌کنم تا مطمئن شوم job جدید دیگر با `veo-3.0-fast` برای duration 15 ساخته نمی‌شود.

## ریسک و کنترل
- ریسک اصلی افزایش هزینه برای 10s/15s است، اما این لازم است چون extension با Fast مجاز نیست. UI فعلاً هزینه‌ی Veo Fast را برای 15s ارزان‌تر نشان می‌دهد؛ اگر بعد از fix اختلاف قیمت باعث ابهام شود، در همین اصلاح preview/cost UI را هم با backend هم‌راستا می‌کنم تا کاربر هزینه‌ی واقعی را ببیند.
- هیچ تغییر دیتابیس یا حذف داده انجام نمی‌شود.
- مسیرهای Wan و Veo Pro دست‌نخورده می‌مانند.