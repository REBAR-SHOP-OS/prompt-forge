## هدف

قانون ساده‌ای که کاربر مشخص کرد:
- **فقط عکس Start** → آن عکس را اول ویدئو قرار بده، ادامه ویدئو با پرامت ساخته شود. (End را فراموش کن، آن را به‌عنوان Last frame استفاده نکن)
- **فقط عکس End** → ویدئویی با پرامت بساز که در **انتها** به عکس End برسد. (این منطق فعلاً درست کار می‌کند)
- **هر دو فریم** → مثل قبل image-to-video با first+last.

## مشکل فعلی

در `src/modules/generator-ui/pages/DashboardPage.tsx` (خط ~746)، حالت "فقط Start" به‌اشتباه همان عکس Start را به‌عنوان `lastFrameUrl` هم می‌فرستد:

```ts
firstFrameUrl: readyStartFrame.url,
lastFrameUrl: readyStartFrame.url,  // ← غلط
```

این باعث می‌شود ویدئو از Start شروع و دوباره به همان Start برگردد (بدون حرکت واقعی مطابق پرامت).

## راه‌حل

شاخه‌ی "Start-only" را متقارن با شاخه‌ی "End-only" بازنویسی کنیم:

1. یک job **text-to-video** (`wan2.7-t2v-2026-04-25`) با پرامت بساز.
2. عکس Start را به‌عنوان یک کلیپ ساکن ۲ ثانیه‌ای به **ابتدای** ویدئوی نهایی **prepend** کن.

### تغییرات کد

**`src/modules/generator-ui/pages/DashboardPage.tsx`**

1. **State جدید**: `pendingStartPrepends` (موازی با `pendingEndAppends` موجود)، شامل persist در localStorage تحت کلید `pending-start-prepends:${userId}`.

2. **شاخه Start-only در `handleSubmit`** (خطوط 746-755): به‌جای ارسال Start به‌عنوان first+last، به text-to-video تغییر دهد و url عکس Start را در `pendingStartPrepends` ذخیره کند:
   ```ts
   } else if (readyStartFrame?.url) {
     createdJob = await jobOrchestratorGateway.createJob({
       providerKey: 'wan',
       requestedModel: 'wan2.7-t2v-2026-04-25',
       prompt: nextPrompt,
       durationSeconds,
     })
     pendingStartPrependUrl = readyStartFrame.url
     seedFrames = { firstFrameUrl: readyStartFrame.url }
   }
   ```

3. **useEffect جدید برای پردازش prepend**: کپی از useEffect موجود `pendingEndAppends` (خطوط 555-619)، با تفاوت اینکه ترتیب در `mergeVideoUrls` معکوس شود — `[stillPublic, proxiedSrc]` به‌جای `[proxiedSrc, stillPublic]`.

4. **مسیر فایل‌های موقت**: `start-still-...` و `with-start-...` به‌جای `end-still-` / `with-end-`.

### بدون تغییر

- بک‌اند، edge functionها، و قرارداد `jobOrchestratorGateway` تغییر نمی‌کنند.
- منطق "هر دو فریم" و "فقط End" دست‌نخورده باقی می‌ماند.
- کتابخانه‌های `imageUrlToClip` و `mergeVideoUrls` همان‌هایی هستند که End-append استفاده می‌کند.

## فایل‌های تغییر یافته

- `src/modules/generator-ui/pages/DashboardPage.tsx` (تنها فایل)
