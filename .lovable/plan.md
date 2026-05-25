# افزودن انتخاب ناحیه و بازه زمانی به Video-to-Video

## هدف
کاربر بتواند روی فریم اول ویدیو **یک کادر مستطیلی** بکشد تا دقیقاً مشخص کند کجای صحنه باید تغییر کند، و یک **بازه زمانی** (شروع/پایان ثانیه) هم انتخاب کند. هر دو به‌صورت توضیحات ساختاریافته به پرامپت Veo اضافه می‌شوند تا مدل بهتر بفهمد کجا و کِی را تغییر دهد.

## تغییرات

### `src/modules/generator-ui/components/VideoToVideoDialog.tsx`
تنها فایلی که عوض می‌شود.

1. **آیکون جدید کنار textarea**
   - دکمه‌ای با آیکون `Crop` (از lucide-react) با تولتیپ «Select area to edit».
   - بعد از کلیک، حالت Select فعال می‌شود و یک overlay روی پلیر ویدیو نمایش داده می‌شود.

2. **Selection overlay روی پلیر**
   - ویدیو pause می‌شود و یک `<canvas>`/`<div>` با موقعیت absolute روی ویدیو می‌آید.
   - کاربر با drag یک مستطیل می‌کشد؛ rectangle با border خط‌چین رزی نمایش داده می‌شود.
   - دکمه‌های «Confirm» / «Clear» در گوشه overlay.
   - مختصات به‌صورت درصد (نسبت به ابعاد ویدیو، نه پیکسل) ذخیره می‌شود تا مستقل از resolution باشد: `{ xPct, yPct, wPct, hPct }`.

3. **انتخاب بازه زمانی (Time range)**
   - زیر textarea یک range slider دوسر (با دو `<Slider>` shadcn یا dual-input ساده) از `0` تا `video.duration`.
   - مقادیر `startSec` و `endSec` با clamp.
   - برچسب کوچک: `Apply change between 2.0s – 5.5s`.
   - اگر کاربر چیزی انتخاب نکند، پیش‌فرض کل کلیپ است و چیزی به پرامپت اضافه نمی‌شود.

4. **ساخت پرامپت غنی‌شده**
   - تابع `buildAugmentedPrompt(userPrompt, region?, timeRange?)` که خروجی فعلی را گسترش می‌دهد:
     ```
     {userPrompt}

     — Target region: focus the change on the area roughly in the
       {vertical} {horizontal} of the frame (approx. {xPct}%–{xPct+wPct}% from the left,
       {yPct}%–{yPct+hPct}% from the top). Leave everything outside this area unchanged.

     — Target time window: apply the change between {startSec}s and {endSec}s of the clip.
       Before and after that window the scene should match the original.

     — Keep the exact same composition, camera angle, framing, lighting,
       subject identity and motion as the reference frame. Only change what
       was explicitly requested above. Do not add new subjects. Do not
       change the environment unless asked.
     ```
   - `{vertical}` و `{horizontal}` از مرکز کادر محاسبه می‌شوند (top/middle/bottom + left/center/right) تا توضیح برای مدل طبیعی‌تر باشد.

5. **رسم کادر روی فریم آپلودی (اختیاری ولی توصیه‌شده)**
   - در `snapshotFirstFrame`، اگر `region` تنظیم شده باشد، **روی همان canvas** قبل از `toBlob` یک مستطیل نیمه‌شفاف رزی + خط پررنگ بکشیم.
   - این کار به Veo کمک می‌کند بصری هم بفهمد کدام ناحیه را عوض کند (چون Veo از mask پشتیبانی نمی‌کند، این تنها سیگنال بصری ممکن است).
   - یک checkbox کوچک «Show region on reference frame» (پیش‌فرض روشن) که کاربر بتواند خاموش کند.

6. **State و reset**
   - state جدید: `selectMode`, `region`, `timeRange`, `videoDuration`.
   - در effect مربوط به `open=false`، همه را پاک می‌کنیم (هم‌راستا با reset فعلی).

## بدون تغییر در
- Edge functions و adapter Veo (همه چیز همچنان از طریق همان پرامپت متنی + first frame می‌رود).
- `jobOrchestratorGateway.createJob` و امضای آن.
- Persistence/hydration در `DashboardPage`.

## محدودیت‌ها (شفاف به کاربر)
- Veo از mask ورودی پشتیبانی نمی‌کند؛ region و time range به‌صورت **راهنمای متنی + overlay بصری روی فریم مرجع** ارسال می‌شوند. این کیفیت targeting را بالا می‌برد ولی تضمین قطعی نیست.
- خروجی Veo همچنان حداکثر ۸ ثانیه است؛ time range فقط به مدل می‌گوید «در این بازه از کلیپ تغییر بده، بقیه‌اش مطابق اصل بماند».

## تست دستی
1. باز کردن دیالوگ → کلیک روی آیکون Crop → کشیدن کادر دور سوژه → Confirm.
2. تنظیم بازه ۲s–۵s با اسلایدر.
3. نوشتن پرامپت «change the helmet color to red» → Apply.
4. بررسی کنسول: پرامپت ارسال‌شده باید شامل بخش‌های Target region / Target time window باشد و فریم آپلودشده در bucket باید کادر رزی روی هلمت داشته باشد.
