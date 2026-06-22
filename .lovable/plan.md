Make the About Your Business popover textarea larger and ensure there is no character limit.

### Current state
- The business info popover is `w-80` (320 px) with a `Textarea` of `rows={4}` / `min-h-[96px]`.
- The `business_info` DB column is already `text` (unlimited length).
- There is no `maxLength` prop on the textarea, so text entry is already unlimited.

### Changes
1. **Popover width**: Change `w-80` to `w-96` (384 px) so the field has more horizontal space.
2. **Textarea size**: Increase `rows` from 4 to 6 and `min-h` from `96px` to `144px` so the user sees more content without scrolling.
3. **Character limit**: Add an explicit `maxLength={undefined}` guard (or remove any accidental limit if found) to guarantee no truncation.

### File
- `src/modules/generator-ui/components/ProductAdDialog.tsx` — lines around the business info `PopoverContent` and `Textarea`.

No backend or database changes needed.