## Goal
Make the Character Sheet dialog fully English — replace the Persian subtitles under the model options shown in your screenshot.

## Change
In `src/modules/generator-ui/components/CharacterSheetDialog.tsx`, the model options have Persian `hint` subtitles (lines 19–21):

```text
Fast          سریع
High quality  کیفیت بالا
Detailed      جزئیات
```

Replace the Persian hints with short English descriptions:
- Fast → "Quick & cheap"
- High quality → "Best detail"
- Detailed → "Text & fine detail"

(The main labels are already English; only the small grey subtitle line changes.)

## Verification
Open Character Sheet and confirm the three model options show only English text.

No other Persian text exists in this dialog.