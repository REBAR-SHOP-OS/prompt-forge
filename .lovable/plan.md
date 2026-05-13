## هدف
اضافه کردن یک منوی انتخاب مدل (لیست تخت) کنار دکمه **Prompt** در پایین کامپوزر، تا کاربر بتواند مدل تولید ویدیو را انتخاب کند. Provider به‌طور خودکار از روی مدل استنتاج می‌شود.

## مدل‌های قابل انتخاب
بر اساس رجیستری فعلی (`core_ai_provider_registry`) و کدهای Wan/Flow پشتیبان:
- **Wan 2.7 — Image to Video** → `wan` / `wan2.7-i2v-2026-04-25`
- **Wan 2.7 — Text to Video** → `wan` / `wan2.7-t2v-2026-04-25`
- **Flow Video v1** → `flow` / `flow-video-1`

(t2v فقط در حالت Text-to-Video و i2v فقط وقتی فریم Start/End موجود است در دسترس خواهد بود؛ Flow در هر دو حالت قابل انتخاب است.)

## تغییرات UI (فقط فرانت‌اند)
فایل: `src/modules/generator-ui/pages/DashboardPage.tsx`

1. **State جدید**:
   ```ts
   type ModelChoice = { id: string; label: string; providerKey: 'wan'|'flow'; model: string; supports: ('t2v'|'i2v')[] }
   const [selectedModelId, setSelectedModelId] = useState<string>('wan-i2v')
   ```
   مقدار اولیه با حالت فعلی (`isTextToVideo` → `wan-t2v`، در غیر این صورت `wan-i2v`) همگام می‌شود.

2. **منوی Popover**: یک دکمه کوچک کنار دکمه `Prompt` (همان ردیف، سمت چپ آن) با همان استایل دکمه‌های دور؛ متن آن نام مدل انتخابی فعلی است (مثلاً `Wan 2.7 i2v`). با کلیک، PopoverContent یک لیست تخت از همهٔ مدل‌های مجاز را نمایش می‌دهد.

3. **فیلتر هوشمند**: گزینه‌هایی که با حالت فعلی همخوانی ندارند (مثلاً `wan-i2v` وقتی هیچ Start/End نیست و `isTextToVideo=true`) به‌صورت غیرفعال (با توضیح) نمایش داده می‌شوند تا کاربر سردرگم نشود.

4. **ارسال به Backend**: در بلوک `handleGenerateClip` (خطوط ۱۶۱۸–۱۶۶۰)، به‌جای hardcode کردن `providerKey: 'wan'` و مدل ثابت، از `selectedModel.providerKey` و `selectedModel.model` استفاده می‌شود. منطق فعلی (i2v vs t2v بر اساس وجود فریم) حفظ می‌شود اما provider/model از انتخاب کاربر می‌آید.

5. **Persistence سبک**: انتخاب کاربر در `localStorage` تحت کلید `ui:preferred-model` ذخیره می‌شود و در mount بعدی بازیابی می‌گردد.

## خارج از محدوده
- بک‌اند، رجیستری دیتابیس، و edge functions تغییری نمی‌کنند (`flow` در حال حاضر در `service.ts` پیاده‌سازی واقعی ندارد و در صورت انتخاب، اگر `FLOW_API_KEY` تنظیم نباشد خطای «provider API key missing» از بک‌اند برمی‌گردد — همان رفتار فعلی برای provider بدون کلید).
- تغییری در ظاهر باقی دکمه‌ها داده نمی‌شود.

## تأیید
- کلیک روی منو → سه گزینه نمایش داده می‌شود.
- انتخاب Wan t2v → بدون فریم، job با `wan2.7-t2v-2026-04-25` ساخته می‌شود.
- انتخاب Wan i2v + فریم Start → job با `wan2.7-i2v-2026-04-25` ساخته می‌شود.
- انتخاب Flow → request با `providerKey:'flow'` ارسال می‌شود (اگر کلید نباشد، toast خطای backend نمایش داده می‌شود — انتظار طبیعی).
- پس از Reload، آخرین مدل انتخابی حفظ می‌شود.
