## مشکل

ارور `Failed to fetch dynamically imported module .../transcodeToMp4.ts` ناشی از این خطای Vite است:

```
Missing "./dist/umd/ffmpeg-core.js" specifier in "@ffmpeg/core" package
```

پکیج `@ffmpeg/core` در `package.json` فقط این subpath ها را در `exports` اعلام کرده:
- `.` → ESM/UMD
- `./wasm` → ESM/UMD

بنابراین import کردن مستقیم `@ffmpeg/core/dist/umd/ffmpeg-core.js?url` توسط Vite بلاک می‌شود (هرچند فایل روی دیسک وجود دارد). در نتیجه ماژول `transcodeToMp4.ts` اصلاً لود نمی‌شود و کل دیالوگ Trim می‌ترکد.

از طرف دیگر، استفاده از ESM build (که در `exports.import` تعریف شده) باعث هنگ در Worker می‌شود — همان مشکل قبلی.

## راه‌حل

فایل‌های UMD core را به‌صورت static asset از `public/` سرو می‌کنیم تا کاملاً مستقل از resolver Vite باشد:

1. کپی `node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js` به `public/ffmpeg/ffmpeg-core.js`
2. کپی `node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm` به `public/ffmpeg/ffmpeg-core.wasm`
3. در `src/modules/generator-ui/lib/transcodeToMp4.ts`:
   - حذف دو import مشکل‌دار `@ffmpeg/core/dist/umd/...?url`
   - جایگزینی با URL ثابت:
     ```ts
     const coreUrl = '/ffmpeg/ffmpeg-core.js'
     const wasmUrl = '/ffmpeg/ffmpeg-core.wasm'
     ```
   - بقیه‌ی منطق `loadLocal` / `toBlobURL` / fallback به unpkg بدون تغییر می‌ماند.

## چرا این کار می‌کند

- فایل‌های `public/` بدون عبور از resolver Vite سرو می‌شوند، پس قید `exports` بی‌اثر است.
- نسخه‌ی UMD با Worker کلاسیک `@ffmpeg/ffmpeg` سازگار است (بر خلاف ESM که `import.meta.url` دارد).
- Fallback به CDN unpkg به‌عنوان لایه‌ی دوم حفظ می‌شود.

## فایل‌های تغییریافته

- `public/ffmpeg/ffmpeg-core.js` (جدید، کپی از node_modules)
- `public/ffmpeg/ffmpeg-core.wasm` (جدید، کپی از node_modules)
- `src/modules/generator-ui/lib/transcodeToMp4.ts` (دو خط import حذف، دو ثابت URL جایگزین)
