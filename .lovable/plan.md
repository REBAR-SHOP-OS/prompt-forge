## هدف
وقتی کاربر آیکون **Prompt** را می‌زند، AI باید ابتدا عکس(های) آپلودشده (Start و در صورت وجود End) را ببیند، سپس بر اساس متن کاربر، یک پرامت ویدیویی **برای همان عکس** بنویسد. اگر عکسی نیست، رفتار فعلی (فقط متن) حفظ شود.

## تغییرات

### 1) Edge Function: `supabase/functions/enhance-prompt/index.ts`
- ورودی جدید: `imageUrls: string[]` (اختیاری). آدرس‌های عمومی Storage (همانی که Start/End frame دارند).
- اگر یک یا چند `imageUrls` ارسال شد، پیام user را به صورت **multimodal** بساز:
  ```ts
  content: [
    { type: "text", text: prompt },
    ...imageUrls.map(u => ({ type: "image_url", image_url: { url: u } }))
  ]
  ```
- مدل را روی `google/gemini-2.5-flash` نگه دار (پشتیبانی vision دارد و سریع است).
- SYSTEM_PROMPT بازنویسی شود تا روشن کند:
  > «اگر تصویری ضمیمه شده، اول صحنه را با دقت توصیف کن (سوژه، ترکیب‌بندی، نور، رنگ‌ها، سبک)، سپس بر اساس درخواست کاربر یک پرامت سینمایی برای **همین تصویر** بنویس که اعمال صحنه/حرکت دوربین/مود را اضافه می‌کند بدون تغییر هویت سوژه. اگر تصویری نیست، فقط متن کاربر را به یک پرامت سینمایی بازنویسی کن.»
- اعتبارسنجی: حداکثر 4 URL، هر URL باید با `http(s)://` شروع شود.
- بقیه منطق (auth، error handling 429/402، strip quotes) دست‌نخورده.

### 2) Client: `src/modules/generator-ui/pages/DashboardPage.tsx`
خط 641 — هنگام invoke، URLهای فریم آماده را همراه ارسال کن:
```ts
const imageUrls = [readyStartFrame?.url, readyEndFrame?.url].filter(Boolean) as string[]
const { data, error } = await supabase.functions.invoke('enhance-prompt', {
  body: { prompt: current, imageUrls },
})
```
(`readyStartFrame` و `readyEndFrame` همین حالا در همان scope در دسترس‌اند.)

## چرا امن است
- بدون `imageUrls`، رفتار قبلی دقیقاً حفظ می‌شود.
- نه schema دیتابیس تغییر می‌کند، نه RLS، نه auth.
- Gateway فعلی (Lovable AI) مدل vision‌دار را پشتیبانی می‌کند و کلید `LOVABLE_API_KEY` از قبل تنظیم است.
- خطاهای 429/402 همان‌طور به کلاینت برمی‌گردند و توستِ موجود نمایش داده می‌شود.