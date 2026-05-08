## مشکل فعلی

دو ایراد در فایل `src/modules/generator-ui/pages/DashboardPage.tsx`:

### 1) Apply Changes واقعاً روی کارت اعمال نمی‌شود
تابع `applyTrimToCard` (خط ۵۳۴) فقط یک blob URL محلی در state `editedClips` ذخیره می‌کند:
- ویدیوی اصلیِ کارت در History (همان `job.video.storage_path`) عوض نمی‌شود.
- thumbnail و مدت‌زمان نمایش‌داده‌شده در کارت بروزرسانی نمی‌شود.
- بعد از refresh صفحه، تغییرات از بین می‌رود (در DB ذخیره نمی‌شود).

### 2) Final Film کارت‌های ادیت‌شده را نادیده می‌گیرد
در `handleMergeAllVideos` (خط ۱۷۲۶):
```ts
urls.push(await proxiedVideoUrl(clip.job.video!.storage_path as string))
```
از `storage_path` اصلی استفاده می‌کند و `editedClips[id]` را اصلاً نگاه نمی‌کند. همچنین لیست `eligibleClips` همهٔ کلیپ‌های قابل‌نمایش را شامل می‌شود، نه فقط کارت‌هایی که ادیت شده‌اند.

---

## برنامهٔ اصلاح

تنها فایل تغییریافته: `src/modules/generator-ui/pages/DashboardPage.tsx`

### الف) واقعاً اعمال‌کردن Apply Changes روی کارت
بازنویسی `applyTrimToCard(jobId)`:
1. blob خروجی trim را در باکت `merged-videos` آپلود کن (مسیر: `${userId}/edited-${jobId}-${Date.now()}.${ext}`).
2. `publicUrl` نتیجه را بگیر.
3. `setGeneratedVideos` را به‌روزرسانی کن: برای جابِ مربوطه، `video.storage_path` را با URL جدید و `video.duration` را با `newDuration` جایگزین کن (با استفاده از pattern موجود `mergeJob`).
4. `editedClips[jobId]` همچنان نگه داشته شود (برای پخش فوری بدون نیاز به دانلود مجدد) و علاوه بر آن یک Set جدید `editedJobIds` (پایدار در localStorage با کلید `edited-clips:${userId}`) اضافه شود تا بدانیم کدام کارت‌ها «اعمال‌شده» هستند.
5. اگر فایل قبلیِ ادیت در باکت متعلق به ما بود، قبل از آپلود جدید پاک شود (cleanup).

نتیجه: کارت History واقعاً ویدیوی trim‌شده را نشان می‌دهد، duration درست است، و پس از refresh هم باقی می‌ماند.

### ب) Final Film فقط کارت‌های ادیت‌شده را به‌هم وصل کند
در `handleMergeAllVideos`:
1. اگر `editedJobIds.size >= 2`، آن‌گاه `eligibleClips` را به کلیپ‌هایی محدود کن که `editedJobIds.has(c.id)` است (با حفظ ترتیب نمایش فعلی).
2. اگر هیچ کارتی Apply نشده بود، رفتار قبلی حفظ شود (یا پیغام راهنمایی نشان داده شود — باید با کاربر مشخص شود؛ پیش‌فرض پیشنهادی: همان رفتار قبلی fallback).
3. هنگام ساخت `urls`، ابتدا `editedClips[clip.id]?.url` را ترجیح بده، سپس `proxiedVideoUrl(clip.job.video!.storage_path)` (چون storage_path هم بعد از مرحلهٔ الف بروز شده، این یک fallback ایمن است).

### ج) پاکسازی
- در `handleStartOver` (طبق قاعدهٔ قبلی، حذف نمی‌کند) فقط `editedClips` و `editedJobIds` را reset کن (چون workspace state است)، اما فایل‌های آپلودشده در باکت دست نخورند.
- در `deleteCard`، اگر کارت در `editedJobIds` بود، آن را حذف کن.

---

## جزئیات فنی کلیدی

```text
applyTrimToCard(jobId)(blob, duration, ext):
  path = `${userId}/edited-${jobId}-${ts}.${ext}`
  upload(path, blob, contentType)
  url = getPublicUrl(path)
  setGeneratedVideos(prev => prev.map(j =>
    j.id === jobId
      ? { ...j, video: { ...j.video, storage_path: url, duration } }
      : j
  ))
  setEditedClips(prev => ({ ...prev, [jobId]: { url: blobUrl, duration } }))
  setEditedJobIds(prev => new Set(prev).add(jobId))  // + persist
```

```text
handleMergeAllVideos:
  base = displayedClips.filter(...)
  eligibleClips = editedJobIds.size >= 2
    ? base.filter(c => c.kind === 'image' || editedJobIds.has(c.id))
    : base
  for clip in eligibleClips:
    src = editedClips[clip.id]?.url ?? await proxiedVideoUrl(clip.job.video.storage_path)
```

با این دو تغییر، Apply Changes واقعاً ماندگار و قابل‌مشاهده می‌شود و Final Film فقط کارت‌های اعمال‌شده را به ترتیب به یکدیگر وصل می‌کند.