## علت اصلی

در `src/modules/generator-ui/lib/transcodeToMp4.ts` این دو import داریم:

```ts
import coreUrl from '@ffmpeg/core?url'
import wasmUrl from '@ffmpeg/core/wasm?url'
```

این‌ها به نسخه **ESM** هسته اشاره می‌کنند (`/node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js` — در network log قابل مشاهده). ولی کتابخانه `@ffmpeg/ffmpeg` هنگام `ff.load()` این فایل را به‌صورت یک Worker با `importScripts` (یعنی classic script) اجرا می‌کند. فایل ESM شامل `import.meta.url` و `await import(...)` است که داخل classic script اجرا نمی‌شود؛ Worker بی‌صدا خراب می‌شود و `ff.load()` هرگز resolve نمی‌شود.

نتیجه: UI روی «Loading encoder… 50%» می‌ماند تا تایم‌اوت ۶۰ ثانیه‌ای local load اتفاق بیفتد، سپس fallback به remote هم همان مشکل را دارد، و در نهایت با خطا fail می‌شود (یا اگر هنوز در حال load است، روی ۵۰٪ گیر می‌کند).

## راه‌حل

تعویض import‌ها به نسخه **UMD** که برای classic script ساخته شده:

```ts
import coreUrl from '@ffmpeg/core/dist/umd/ffmpeg-core.js?url'
import wasmUrl from '@ffmpeg/core/dist/umd/ffmpeg-core.wasm?url'
```

این فایل‌ها واقعاً در پروژه موجودند (تایید شده در `node_modules/@ffmpeg/core/dist/umd/`). بقیه منطق `loadLocal` / `toBlobURL` / fallback همان می‌ماند.

## فایل تغییر یافته

- `src/modules/generator-ui/lib/transcodeToMp4.ts` — فقط دو خط import.

## اعتبارسنجی

- باز کردن Trim → Mark cut → Apply
- نوار پیشرفت باید از «Recording» (۰→۵۰٪) به «Loading encoder» (~۵۰٪) و بلافاصله به «Encoding» (۵۵→۹۵٪) و «Finalizing» (~۹۸٪) برسد و دیالوگ بسته شود.
- در network باید `ffmpeg-core.js` از مسیر `dist/umd/` خوانده شود (نه `dist/esm/`).
