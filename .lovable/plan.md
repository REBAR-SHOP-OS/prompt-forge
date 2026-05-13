## هدف

1. هر بار کاربر **Music** یا **Voiceover** اضافه/تغییر/حذف می‌کند، همان لحظه روی **پری‌ویو** قابل شنیدن باشد (بدون نیاز به Final Film).
2. پری‌ویو پیش‌فرض در حالت «Project» باید **همهٔ کارت‌های هیستوری را پشت‌سرهم پخش کند** (تصاویر و ویدیوها به ترتیب `displayedClips`)، طوری‌که کاربر فیلم کامل را قبل از Final Film ببیند.
3. **Final Film** فقط ثبت نهایی در Library می‌شود (همان رفتار فعلی) — پری‌ویو از قبل همان چیزی را نشان می‌دهد که Final Film خواهد ساخت.

تغییرات فقط در فرانت‌اند (UI/پلیر) و بدون دست‌زدن به `mergeVideos.ts`، edge functionها یا schema.

## تغییرات در `src/modules/generator-ui/pages/DashboardPage.tsx`

### 1) حالت پری‌ویوی جدید: `project`
- یک `PreviewItem` سوم اضافه می‌شود: `{ kind: 'project', clips: UnifiedClip[] }`.
- منطق `previewItem`:
  - اگر کاربر صراحتاً روی یک کارت کلیک کرده (`previewVideoId` ست شده) → همان رفتار فعلی (single).
  - در غیر این صورت و اگر `displayedClips.length > 0` → `kind: 'project'` با کل لیست به ترتیب `displayedClips`.
- یک کنترل کوچک «Preview: Project / Single» نزدیک پری‌ویو نمایش داده می‌شود تا کاربر بتواند بین حالت پروژه و کارت تکی سوییچ کند.

### 2) کامپوننت جدید `ProjectPreviewPlayer` (in-file یا فایل کوچک کنار `TransitionPreview`)
پلیر کلاینتی که زنجیرهٔ کلیپ‌ها + audio overlay را هم‌زمان پخش می‌کند:

- ورودی‌ها: `clips` (مرتب)، `aspectRatio`، `musicUrl?`, `musicRange`, `voiceoverUrl?`, `clipVolume`, `musicVolume`, `voiceoverClipVolume`, `voiceoverVolume`, `soundtrackMode`, `imageStillSeconds` (برای کلیپ‌های image).
- ساختار:
  - یک `<video>` که منبعش به‌ترتیب `clips` تعویض می‌شود (با `onEnded` به سراغ بعدی می‌رود).
  - برای کلیپ‌های `image`: یک `<img>` فول‌فریم به‌جای video، با تایمر برابر `still_duration_seconds`.
  - دو `<audio>` مخفی برای music و voiceover که هم‌زمان با Play/Pause/Seek پلیر هماهنگ می‌شوند.
- منطق volume mixing دقیقاً مطابق همان فرمولی که در `handleMergeAllVideos` ساخته می‌شود:
  - `hasMusic && soundtrackMode==='music-only'` → `videoEl.muted = true`.
  - `hasMusic && soundtrackMode==='mix'` → `videoEl.volume = clipVolume`، `musicEl.volume = musicVolume`.
  - `!hasMusic && hasVoiceover` → `videoEl.volume = voiceoverClipVolume`، `voiceoverEl.volume = voiceoverVolume`.
  - بدون music/voiceover → `videoEl.volume = 1`.
- موقعیت زمانی music: `musicEl.currentTime = musicRange[0] + elapsedAcrossPlaylist`؛ اگر از `musicRange[1]` گذشت تا انتها mute.
- voiceover: از ابتدا پخش می‌شود و وقتی به انتها رسید قطع — همان رفتار backend (که voiceover روی کل تایم‌لاین overlay می‌شود).
- Play/Pause از روی state داخلی پلیر کنترل می‌شود؛ کاربر می‌تواند با کلیک روی هر کارت پری‌ویوی تکی را باز کند.

### 3) واکنش زنده به تغییر music/voiceover
- چون پلیر این prop ها را می‌گیرد و در `useEffect` ولوم/منبع را هماهنگ می‌کند، هر تغییر در `musicUrl/musicRange/musicVolume/clipVolume/soundtrackMode/voiceoverUrl/voiceoverVolume/voiceoverClipVolume` بلافاصله روی پری‌ویو اعمال می‌شود.
- پاپ‌آپ‌های موجود (Soundtrack dialog و Voiceover volume popover) هیچ تغییری نمی‌کنند؛ صرفاً مقادیرشان به این پلیر هم می‌رسد.

### 4) رفتار Final Film
- بدون تغییر منطق: `handleMergeAllVideos` همان merge سرور را با همان مقادیر volume می‌سازد و در Library ثبت می‌کند.
- تنها تغییر: بعد از Final Film موفق، پری‌ویو روی همان مرج خروجی سوییچ می‌شود (که الان هم همین کار انجام می‌شود).

## تأیید

```text
1) چند کارت در هیستوری → پری‌ویو به‌صورت پیش‌فرض «Project» شده و همهٔ کلیپ‌ها پشت‌سرهم پخش می‌شوند.
2) افزودن Music → بلافاصله روی همان پری‌ویوی زنجیره‌ای شنیده می‌شود.
3) افزودن Voiceover (با/بدون music) → بلافاصله شنیده می‌شود؛ ولوم‌ها مطابق popoverها.
4) تغییر musicRange / musicVolume / voiceoverVolume / soundtrackMode → بدون reload روی پری‌ویو اعمال می‌شود.
5) کلیک روی یک کارت → پری‌ویوی تکی همان کارت (رفتار قبلی).
6) Final Film → دقیقاً همان چیزی که در پری‌ویو پخش می‌شد در Library ذخیره می‌شود.
```

## خارج از محدوده
- بدون تغییر در `mergeVideos.ts`، edge functionها، schema یا قراردادها.
- بدون تغییر در منطق ولوم/voiceover/music که قبلاً پیاده‌سازی شده.
- بدون merge سمت سرور برای پری‌ویو (هزینه‌ای ایجاد نمی‌شود).
