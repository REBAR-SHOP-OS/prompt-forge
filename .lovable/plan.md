## مشکل

هنگام Apply changes خطای «Failed to load video: https://dashscope-463t.oss-…aliyuncs.com/…» نمایش داده می‌شود.

دلیل: در `DashboardPage.tsx` (خط ۱۸۹۱) آدرس ویدیو **مستقیماً** از `job.video.storage_path` (یک URL امضاشده‌ی Aliyun OSS متعلق به ارائه‌دهنده‌ی خارجی) به `ClipTrimmerDialog` پاس داده می‌شود. در `trimVideo.ts` این URL با `crossOrigin = "anonymous"` در یک `<video>` لود می‌شود تا فریم‌ها روی canvas کشیده شوند، اما سرور Aliyun هدر `Access-Control-Allow-Origin` نمی‌فرستد → مرورگر لود را قطع می‌کند → پیام «Failed to load video».

بقیه‌ی جاهای پروژه (مثل merger و last-frame extractor در خطوط ۱۰۸۹، ۱۱۵۶، ۱۴۶۸، ۱۵۳۵، …) دقیقاً به همین دلیل قبل از مصرف، URL را از `proxiedVideoUrl()` رد می‌کنند تا از طریق edge function `video-proxy` با هدرهای CORS صحیح بازگردد. مسیر Edit این مرحله را جا انداخته است.

## راه‌حل (فقط فرانت‌اند، بدون تغییر بک‌اند)

URL ارسالی به مودال Trim را قبل از باز کردن، از همان `proxiedVideoUrl` عبور بدهیم.

### تغییرات

**`src/modules/generator-ui/pages/DashboardPage.tsx`**
1. یک state جدید: `const [trimSrc, setTrimSrc] = useState<string | null>(null)`.
2. یک effect: وقتی `trimmingJobId` ست می‌شود، اگر `editedClips[id]?.url` موجود است همان (Blob URL، CORS ندارد) را در `trimSrc` بگذار؛ در غیر این صورت `await proxiedVideoUrl(job.video.storage_path)` را صدا بزن و نتیجه را در `trimSrc` بگذار. در پاکسازی `setTrimSrc(null)`.
3. در رندر مودال (خطوط ۱۸۸۲-۱۸۹۶):
   - تا زمانی که `trimSrc` آماده نشده، یک placeholder ساده (مثلاً همان Dialog با اسپینر یا اصلاً رندر نکن) نشان بده.
   - `videoUrl={trimSrc}` به جای مقدار فعلی.
4. در closing مودال (`onOpenChange`) علاوه بر `setTrimmingJobId(null)`، `setTrimSrc(null)` هم انجام شود.

### چرا این کافی است
- `video-proxy` همان host پروژه است → CORS ندارد، `crossOrigin="anonymous"` کار می‌کند، canvas tainted نمی‌شود و `MediaRecorder` خروجی معتبر می‌دهد.
- Blob URLهای `editedClips` (نتیجه ترِیم قبلی) ذاتاً same-origin هستند، پس بدون تغییر مستقیم پاس می‌شوند.
- در `trimVideo.ts` و `ClipTrimmerDialog.tsx` هیچ تغییری لازم نیست.

## خارج از scope
- ذخیره‌ی نسخه‌ی ترِیم‌شده در storage یا DB.
- تغییر در edge function `video-proxy` (در حال حاضر کار می‌کند و سایر مسیرها از آن استفاده می‌کنند).
