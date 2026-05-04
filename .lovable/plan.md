## هدف

اجازه دادن ساخت ویدئو حتی وقتی فقط Start یا فقط End آپلود شده:

- **فقط Start (بدون End)**: همان تصویر Start هم به‌عنوان `firstFrameUrl` و هم `lastFrameUrl` به provider فرستاده شود (i2v یک‌فریمی).
- **فقط End (بدون Start)**: اول یک ویدئوی text-to-video از prompt ساخته می‌شود؛ بعد از آماده شدن، تصویر End به مدت ۲ ثانیه به انتهای آن merge می‌شود.