## هدف

در همه‌ی پروژه‌ها (چه فاینال ویدئو و چه درفت)، وقتی روی فضای خالی اطراف پلیر کلیک می‌شود، باید همیشه همان پریوو نهاییِ ساخته‌شده از اتصال کارت‌ها (sequence preview) دیده شود — نه فقط یک کلیپ تکی یا ویدئوی merged قفل‌شده.

## وضعیت فعلی

- کلیک روی فضای خالیِ `<main>` (خطوط ۷۵۳۹–۷۵۴۶) مقدار `previewVideoId` را `null` و `previewDismissed` را `false` می‌کند. این برای پروژه‌های درفت درست کار می‌کند.
- اما در `previewItem` (خطوط ۳۳۵۱–۳۳۵۳)، وقتی پروژه‌ای از کتابخانه باز است (`selectedProjectId`)، پریوو به ویدئوی merged همان پروژه قفل می‌شود و دیگر به نمای «اتصال کارت‌ها» برنمی‌گردد.

## تغییر

فقط در فایل `src/modules/generator-ui/pages/DashboardPage.tsx` (تغییر صرفاً UI/presentation):

در منطق `previewItem`، شاخه‌ی `selectedProjectId`:

- اگر کاربر فضای خالی را کلیک کرده باشد (یعنی `previewVideoId` خالی و `previewDismissed` برابر `false`) و تعداد کلیپ‌های قابل‌پخش (`playableSequenceClips.length >= 2`) باشد، به‌جای قفل‌شدن روی ویدئوی merged، نمای دنباله‌ای اتصال کارت‌ها (`{ kind: 'sequence', clips: playableSequenceClips }`) نمایش داده شود.
- در غیر این صورت (کمتر از ۲ کلیپ یا عدم آمادگی دنباله)، رفتار فعلی حفظ شود: ابتدا ویدئوی merged پروژه، و اگر آماده نبود، fallback موجود.

به این ترتیب رفتار در پروژه‌های فاینال و درفت یکسان می‌شود و کلیک روی فضای خالی همیشه پریوو نهایی اتصال کارت‌ها را نشان می‌دهد.

## جزئیات فنی

```text
previewItem (useMemo):
  if lastMergedPreview -> final film  (بدون تغییر)
  if previewVideoId -> همان کارت        (بدون تغییر)
  if previewDismissed -> null           (بدون تغییر)
  if selectedProjectId:
      // جدید:
      if playableSequenceClips.length >= 2 -> { kind:'sequence', clips }
      else if proj.video.storage_path     -> { kind:'video', job: proj }
  ... بقیه fallbackها بدون تغییر
```

## بررسی صحت

یک پروژه‌ی فاینال را باز کنید، روی یک کارت کلیک کنید، سپس روی فضای خالی کلیک کنید — باید پریوو به نمای «اتصال کارت‌ها» برگردد. همین را روی یک درفت هم تأیید کنید.
