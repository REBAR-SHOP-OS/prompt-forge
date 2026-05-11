## هدف

دیالوگ Day Information به‌جای اطلاعات تاریخی عمومی، فقط **مناسبت‌های قابل استفاده برای تبلیغات** را نمایش می‌دهد، همراه با **ایده‌های کمپین** برای هر مناسبت، و ترجمه فارسی به‌صورت پیش‌فرض زیر متن انگلیسی نشان داده می‌شود.

## تغییرات Backend — `supabase/functions/day-info/index.ts`

بازنویسی پرامپت‌ها (بدون تغییر امضای ورودی/خروجی):

- **System prompt** جدید:
  > "You are a marketing strategist. For a given Gregorian date, return only the observances and holidays that are useful for advertising/marketing campaigns (e.g. International Days like World Chocolate Day, Mother's Day, Black Friday, Valentine's Day, Earth Day, shopping events, widely-celebrated cultural days). Skip purely historical events, birthdays, deaths, religious-only observances with no commercial angle, and obscure local holidays. If a date has no marketing-worthy occasion, say so honestly.
  >
  > Output bilingual GitHub-flavored Markdown. For every section heading and every bullet, write the English line first, then immediately below it the Persian translation in italics on its own line. Use this structure:
  >
  > `## 🎯 Marketing-Worthy Occasions / *مناسبت‌های مناسب تبلیغات*`
  >
  > For each occasion, render:
  > ```
  > ### {Occasion Name} / *{ترجمه فارسی نام مناسبت}*
  > **What it is:** short English description.
  > *توضیح فارسی کوتاه.*
  >
  > **Audience:** who to target in English.
  > *مخاطب هدف به فارسی.*
  >
  > **Campaign Ideas:**
  > - English idea 1
  >   - *ایده فارسی ۱*
  > - English idea 2
  >   - *ایده فارسی ۲*
  > - English idea 3
  >   - *ایده فارسی ۳*
  >
  > **Hashtags:** `#Tag1` `#Tag2` `#Tag3`
  > ```
  >
  > Provide 3–5 concrete campaign ideas per occasion. Keep Persian translations natural and idiomatic, not literal."

- **User prompt:** `Provide marketing-worthy occasions for: ${longDate} (${date}).`

- مدل و سایر تنظیمات بدون تغییر (`google/gemini-3-flash-preview`، مدیریت 429/402).

## تغییرات Frontend — `src/modules/generator-ui/components/CalendarInfoDialog.tsx`

تغییرات کوچک نمایشی فقط:

1. عنوان دیالوگ از `Day Information` به `Marketing Calendar / تقویم تبلیغاتی` تغییر می‌کند.
2. متن fallback (`Pick a date to see…`) دو زبانه می‌شود: `Pick a date to see marketing occasions. / یک تاریخ انتخاب کنید…`.
3. کلاس‌های prose تنظیم شوند تا متن italic (که ترجمه فارسی است) با وزن نرمال و رنگ کمی روشن‌تر (`prose-em:not-italic prose-em:text-zinc-300/90 prose-em:font-normal`) و راست‌چین خوانده شود — برای راست‌چین کردن خطوط فارسی از CSS rule ساده روی `<em>` با `dir="auto"` استفاده می‌کنیم: کل بلوک Markdown داخل `<div dir="auto">` رندر می‌شود تا مرورگر هر خط را به‌صورت خودکار راست‌چین/چپ‌چین کند.
4. هیچ state، cache، یا منطق fetch تغییر نمی‌کند.

## خارج از scope

- بدون آیکون toggle جداگانه (طبق انتخاب کاربر، ترجمه پیش‌فرض همراه انگلیسی است).
- بدون دسته‌بندی صنعتی.
- بدون تغییر در آیکون تقویم، state، یا edge function deployment workflow.
- بدون cache invalidation — کلیدهای cache همان `YYYY-MM-DD` می‌مانند.

## تأیید

- باز کردن دیالوگ روی هر تاریخ → فقط مناسبت‌های تبلیغاتی نمایش داده شود (نه رویدادهای تاریخی، نه تولدها).
- هر مناسبت شامل: نام دو زبانه، توضیح، مخاطب، ۳–۵ ایده کمپین دو زبانه، و هشتگ.
- خطوط فارسی به‌صورت italic و راست‌چین (به لطف `dir="auto"`) نمایش داده شوند.
- اگر تاریخی مناسبت تبلیغاتی نداشت، پیام صادقانه (به دو زبان) برمی‌گردد.
