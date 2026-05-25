## نمایش کامل پرامت با کلیک روی کارت Pending

در `DashboardPage.tsx` خط 5149-5151 پرامت کلیپ در کارت Pending با `max-h-12` به دو خط محدود می‌شود و بقیه قابل دیدن نیست (در اسکرین‌شات هم مشخص است). یک قابلیت اضافه می‌کنیم تا با کلیک روی متن پرامت، متن کامل در یک دیالوگ نمایش داده شود.

### تغییرات در `src/modules/generator-ui/pages/DashboardPage.tsx`

1. اضافه کردن یک state جدید: `const [promptViewer, setPromptViewer] = useState<string | null>(null)`.
2. تبدیل `<p>` پرامت (خط 5149) به یک `<button>` با ظاهر متنی یکسان (همان کلاس‌های کنونی + `cursor-pointer text-left hover:text-zinc-100 transition`)، که با کلیک `setPromptViewer(video.input_prompt)` را صدا می‌زند و `event.stopPropagation()` می‌کند تا کلیک‌های parent کارت اجرا نشوند.
3. افزودن `title={video.input_prompt}` برای hover سریع.
4. در پایین کامپوننت، اضافه کردن یک `Dialog` از `@/components/ui/dialog` که `open={promptViewer !== null}` است؛ شامل عنوان "Prompt" و بدنه scrollable که متن کامل پرامت را نمایش می‌دهد.

### فایل‌ها
- فقط `src/modules/generator-ui/pages/DashboardPage.tsx`.

### ریسک
- بدون تغییر در backend، state، یا منطق job. صرفاً UI.