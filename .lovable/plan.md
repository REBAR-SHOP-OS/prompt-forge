## هدف نهایی
تولید ویدئو باید واقعاً یک provider job بسازد، از حالت Pending خارج شود، و با polling به Completed برسد؛ نه اینکه فقط کارت Pending یا پیام “Still queuing” نشان دهد.

## چیزی که تا الان دقیقاً پیدا شد
- مشکل اعتبار نیست: کاربر اصلی هنوز اعتبار کافی دارد.
- دیتابیس و connection pool سالم‌اند؛ نشانه‌ای از فشار compute یا قفل دائمی دیده نشد.
- آخرین job قابل مشاهده در دیتابیس با مدل قدیمی `veo-3.0-fast-generate-001` fail شده؛ خطای provider هم دقیقاً 404 مدل منسوخ است.
- لاگ UI در 12:56 نشان می‌دهد `jobs-create` از سمت مرورگر بعد از 120 ثانیه timeout شده، اما در audit log همان لحظه هیچ job جدیدی ثبت نشده؛ یعنی مسیر create هنوز در production قابل اتکا نیست.
- ریشه محتملِ باقی‌مانده: شروع provider به صورت background/best-effort انجام می‌شود. در Edge Function این تضمین دائمی نیست؛ ممکن است request سریع 202 بدهد یا از دید client timeout شود، ولی handoff واقعی به Wan/Veo کامل نشود و `provider_job_id` ذخیره نشود.

## برنامه اصلاح از ریشه
1. **قفل کردن مدل‌های Veo روی نسخه معتبر**
   - هر مسیر `flow` را فقط به مدل‌های معتبر Veo 3.1 resolve می‌کنم.
   - علاوه بر mapping در کد، default مدل backend registry را هم بررسی/اصلاح می‌کنم تا دیگر `veo-3.0-*` تولید نشود.

2. **حذف وابستگی خطرناک به background برای provider-start**
   - برای providerهای cloud (`flow`/Veo و `wan`) بعد از ساخت job، handoff به provider را در همان request و با timeout کوتاه و کنترل‌شده انجام می‌دهم تا `provider_job_id` قبل از پاسخ API ذخیره شود.
   - اگر provider شروع را قبول نکرد، job همان‌جا fail/refund می‌شود و UI پیام واقعی می‌گیرد؛ دیگر Pending بی‌پایان نمی‌ماند.
   - برای local router که ممکن است طولانی‌تر باشد، مسیر جدا و bounded نگه داشته می‌شود تا UI قفل نشود.

3. **اصلاح پاسخ createJob**
   - اگر provider handoff موفق شد، API وضعیت `processing` و jobId واقعی برمی‌گرداند.
   - اگر provider busy/timeout/config/model error داد، response کد دقیق و پیام قابل فهم می‌دهد.
   - recovery frontend فقط برای حالت‌های واقعاً recoverable استفاده می‌شود، نه برای پنهان کردن timeout اصلی.

4. **تست واقعی بعد از patch**
   - با session کاربر فعلی یک `jobs-create` واقعی با prompt کوتاه و هزینه کم اجرا می‌کنم.
   - تأیید می‌کنم row ساخته شده، `provider_job_id` پر شده، status به `processing` می‌رود.
   - `jobs-get` را poll می‌کنم تا ویدئو به `completed` برسد و asset قابل پخش ثبت شود.
   - job تستی را بعد از تأیید پاک می‌کنم تا history کاربر شلوغ نشود.

5. **Regression guard**
   - تستی اضافه می‌کنم که هیچ route برای `flow` مدل‌های `veo-3.0-*` برنگرداند.
   - تست/چک backend اضافه می‌کنم که createJob برای provider cloud بدون ذخیره `provider_job_id` در Pending رها نشود.

## فایل‌های درگیر
- `supabase/functions/_shared/modules/external-api-adapter/service.ts`
- `supabase/functions/_shared/modules/job-orchestrator/gateway.ts`
- احتمالاً یک migration کوچک برای اصلاح registry/default مدل اگر دیتابیس هنوز مدل قدیمی دارد
- تست‌های مرتبط با `jobs-create` / route resolution

## معیار قبول نهایی
- API create دیگر 120s timeout نمی‌دهد.
- job جدید با مدل Veo 3.1 یا Wan معتبر ساخته می‌شود.
- `provider_job_id` ذخیره می‌شود.
- status از Pending به Processing و سپس Completed می‌رسد.
- ویدئو در UI قابل پخش است.
- هیچ مدل `veo-3.0-*` دوباره وارد مسیر production نمی‌شود.