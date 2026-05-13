## هدف
وقتی کاربر Voiceover روی Final Film می‌گذارد، بتواند مستقل از موسیقی، **حجم صدای اصلی ویدئو** و **حجم Voiceover** را تنظیم کند.

## وضعیت فعلی
- بک‌اند `mergeVideos.ts` از قبل سه ولوم مستقل را پشتیبانی می‌کند: `clipVolume`, `musicVolume`, `voiceover.volume`.
- در UI فقط برای **موسیقی** اسلایدر وجود دارد (داخل دیالوگ Soundtrack، در حالت Mix).
- برای **Voiceover** هیچ کنترلی نیست؛ `voiceoverVolume` در `DashboardPage.tsx` به‌صورت ثابت `1` تعریف شده و وقتی Voiceover بدون موسیقی فعال باشد، صدای کلیپ به‌طور خودکار صفر می‌شود (پیش‌فرض backend).

## تغییرات (فقط UI، بدون تغییر بک‌اند یا قراردادها)

### 1) State در `DashboardPage.tsx`
- `voiceoverVolume` را به `useState<number>(1)` با setter تبدیل کن.
- یک state جدید `voiceoverClipVolume` با پیش‌فرض `0.3` اضافه کن (وقتی Voiceover هست ولی موسیقی نیست، این مقدار به‌جای صفر ارسال می‌شود تا کاربر صدای اصلی را هم بشنود).

### 2) منطق ارسال در `handleMergeAllVideos`
در ساخت `audioOpt`:
- اگر `hasVoiceover && !hasMusic` → `clipVolume = voiceoverClipVolume`.
- اگر `hasMusic` → همان `soundtrackMode`/`clipVolume` فعلی (بدون تغییر).
- `voiceover.volume` از state جدید `voiceoverVolume` خوانده شود.

### 3) UI — پنل تنظیم صدای Voiceover
کنار چیپ Voiceover (همان جایی که اکنون نام voiceover و دکمهٔ X نمایش داده می‌شود) یک Popover کوچک با آیکون `SlidersHorizontal` اضافه کن که فقط وقتی `voiceoverUrl` فعال است نمایش داده شود. داخل آن دو اسلایدر هم‌سبک با اسلایدرهای موجود در دیالوگ موسیقی:

```
Original clip audio   [—————o———]  30%
Voiceover             [————————o]  100%
```

- بازه: 0–100، گام 1، تبدیل به 0..1 برای state.
- اگر موسیقی هم همزمان فعال باشد، اسلایدر «Original clip audio» در این پنل غیرفعال شود و یک هینت کوتاه نمایش دهد: «Clip audio is controlled from the Soundtrack dialog» (تا منبع حقیقت یکی بماند).

### 4) Reset
در `handleClearVoiceover` و در محل ریست بعد از Final Film، `voiceoverVolume` و `voiceoverClipVolume` را به مقدار پیش‌فرض برگردان.

## خارج از محدوده
- بدون تغییر در `mergeVideos.ts`، edge functionها، schema، یا VoiceoverDialog.
- بدون تغییر روی منطق موسیقی موجود.

## تأیید
1. فقط Voiceover بدون موسیقی → پنل ولوم باز شود؛ هر دو اسلایدر فعال؛ Final Film هر دو صدا را با نسبت تنظیم‌شده پخش کند.
2. Voiceover + موسیقی همزمان → اسلایدر clip در پنل voiceover غیرفعال؛ کنترل از دیالوگ Soundtrack.
3. حذف Voiceover → ولوم‌ها به پیش‌فرض ریست شوند.