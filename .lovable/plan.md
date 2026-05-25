هدف: کاربر بتواند فرایند ساخت ویدئو را در حین رندر کنسل کند. این شامل دو مسیر می‌شود:

1) Final Film (رندر سمت کلاینت — همان مودال "16% Rendering" در اسکرین‌شات)
2) جاب‌های Pending (تولید کلیپ سمت سرور — کارت‌های ستون راست)

برنامه:

A. Final Film — افزودن قابلیت کنسل
- در `src/modules/generator-ui/lib/mergeVideos.ts` پارامتر اختیاری `signal?: AbortSignal` به `mergeVideoUrls` اضافه می‌کنم. در نقاط امن (بین کلیپ‌ها، داخل حلقه‌ی paint، قبل از encode/upload، و در صورت abort داخل MediaRecorder) چک می‌کنیم؛ اگر `signal.aborted` بود recorder/audio و RAF را تمیز متوقف می‌کنیم و یک خطای نام‌گذاری شده `MergeCancelledError` پرتاب می‌کنیم.
- در `DashboardPage.tsx`:
  - یک `mergeAbortRef = useRef<AbortController | null>(null)` اضافه می‌کنم.
  - شروع merge: کنترلر جدید می‌سازم و `signal` را به `mergeVideoUrls` و به `Promise.race` پاس می‌دهم.
  - دکمه‌ی Final Film در حالت `isMerging` تبدیل به دکمه‌ی Cancel می‌شود (هاور قرمز + آیکن X) و با تایید کاربر، `controller.abort()` صدا زده می‌شود.
  - در `catch`، اگر خطا `MergeCancelledError` بود بدون alert فقط state ها (`isMerging`, `mergeProgress`, `mergeStage`) ریست می‌شوند و فایل آپلودشده‌ای هم درکار نیست.
  - برای لغو سمت سرور آپلود وسط راه: قبل از فراخوانی `supabase.storage.upload` چک نهایی abort انجام می‌شود.

B. Pending Jobs — دکمه‌ی Cancel
- در کارت Pending کنار دکمه‌ی حذف، فقط وقتی `status` در `pending` یا `processing` است یک دکمه‌ی «Cancel» با آیکن X اضافه می‌شود. کلیک → دیالوگ تایید → `jobOrchestratorGateway.deleteJob(jobId)` (همان مسیر فعلی حذف امن سمت سرور با soft-delete که جاب را عملاً متوقف می‌کند) + پاکسازی محلی state ها.
- داخل مودال پیش‌نمایش بزرگ هم وقتی `isRendering` است، یک دکمه‌ی Cancel rendering در پایین مودال اضافه می‌شود که همان action را صدا می‌زند.

فایل‌های تغییریافته:
- `src/modules/generator-ui/lib/mergeVideos.ts`
- `src/modules/generator-ui/pages/DashboardPage.tsx`

ریسک‌ها:
- نشت منابع MediaRecorder/AudioContext اگر abort به‌درستی پاکسازی نکند → در `finally` همه‌ی منابع را close می‌کنیم.
- فایل میانی ست (still-frame webmهای آپلودشده برای تصاویر) ممکن است در bucket باقی بمانند؛ همان رفتار فعلی است و در این task پاک نمی‌شوند (ریسک پذیرفته).
- هیچ تغییری در backend، RLS، یا منطق Draft نمی‌دهیم.