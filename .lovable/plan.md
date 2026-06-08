## Goal

In the Product Ad dialog (`ProductAdDialog.tsx`), when the language is set to Persian, every option chip and its category header must display in Persian — matching what the Video templates section already does. Today three sections stay in English even in Persian mode:

- **Camera styles** (سبک دوربین): "Whip Pan", "Orbit Shot", "FPV Drone", …
- **Genre & atmosphere** (ژانر و حال‌وهوا): "Epic Fantasy", "Sci-Fi Minimalist", …
- **Scene & environment** (صحنه و محیط): chips like "Construction Site" plus the group headers "INDUSTRIAL & CONSTRUCTION", "URBAN & MODERN", etc.

## Changes (single file: `src/modules/generator-ui/components/ProductAdDialog.tsx`)

1. **Add Persian labels to the data arrays** (mirroring the existing `labelFa` pattern used by `VIDEO_TEMPLATES`):
   - `CAMERA_STYLES`: add `labelFa` to each entry (e.g. Whip Pan → «پن سریع», Orbit Shot → «نمای مداری», FPV Drone → «پهپاد FPV», Tracking Shot → «نمای تعقیبی», Push In Cinematic → «پوش‌این سینمایی», Fly Through → «عبور پروازی», Crash Zoom → «زوم ضربه‌ای», Handheld Dynamic → «دوربین‌روی‌دست پویا», Dolly Zoom → «دالی زوم», Parallax Motion → «حرکت پارالاکس»).
   - `GENRE_TEMPLATES`: add `labelFa` to each (e.g. Epic Fantasy → «فانتزی حماسی», Sci-Fi Minimalist → «علمی‌تخیلی مینیمال», Post-Apocalyptic → «پساآخرالزمانی», Horror Jump-Scare → «وحشت ناگهانی», High-Octane Action → «اکشن پرتحرک», Romantic Dreamscape → «رؤیای رمانتیک», Documentary / Realism → «مستند/واقع‌گرا», Anime / Manga Style → «سبک انیمه/مانگا»).
   - `SCENE_TEMPLATES`: add `labelFa` for each chip and `groupFa` for its category (Industrial & Construction → «صنعتی و ساخت‌وساز», Urban & Modern → «شهری و مدرن», Natural & Epic Landscapes → «مناظر طبیعی و حماسی», Historical & Fantasy → «تاریخی و فانتزی», Interior & Moody → «فضای داخلی و حسی»). Persian chip labels e.g. Construction Site → «کارگاه ساختمانی», Heavy Industry Factory → «کارخانه صنایع سنگین», etc.

2. **Add a Persian group lookup** for scenes, like the existing `VIDEO_GROUP_FA`:
   - `const SCENE_GROUP_FA: Record<string,string>` built from `SCENE_TEMPLATES` `group → groupFa`.

3. **Update the render (JSX) to switch on `lang`:**
   - Camera chips (line ~632): `{lang === 'fa' ? style.labelFa : style.label}`.
   - Genre chips (line ~662): `{lang === 'fa' ? g.labelFa : g.label}`.
   - Scene group header (line ~675 area): show `{lang === 'fa' ? SCENE_GROUP_FA[group] : group}`.
   - Scene chips (line ~698): `{lang === 'fa' ? s.labelFa : s.label}`.

4. **Type updates:** extend the inline types for `CAMERA_STYLES`, `GenreTemplate`, and `SceneTemplate` to include the new `labelFa` (and `groupFa` for scenes).

## Notes

- Selection state continues to key off the English `label`/`id` and the English `prompt` is still what gets sent to the AI, so generation behavior is unchanged — only the displayed text becomes Persian.
- Emojis/icons stay the same in both languages.
- Scope is limited to this dialog (the section shown in the screenshot). If you also want the Scenario Writer dialog or other panels translated, that can be a follow-up.
