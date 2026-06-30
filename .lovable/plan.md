## Goal
Stop product code numbers (e.g. `wire_mesh 002`, `Rebar Stirrup 008`) from being written onto generated images. Only the clean product name should be considered when the AI writes the advertising prompt/tagline.

## Change
In `src/modules/generator-ui/components/AiImageDialog.tsx`, inside `handleWritePrompt`, sanitize the product name before sending it to the `write-image-prompt` edge function:

- Add a small helper that strips trailing identifier numbers/codes from the name, e.g. `"wire_mesh 002"` → `"wire_mesh"`, `"Rebar Stirrup 008"` → `"Rebar Stirrup"`. It removes trailing digit groups (and leftover separators like `_`, `-`, `#`, spaces), while keeping the meaningful name. If stripping would leave an empty string, fall back to the original name.
- Use the sanitized value for `productName` at line 505.

```text
"wire_mesh 002"     -> "wire mesh"
"Rebar Stirrup 008" -> "Rebar Stirrup"
"Product #12"       -> "Product"
```

## Why this is enough
The edge function `write-image-prompt` only renders on-image tagline text from `productName`. Removing the numeric code at the source means the model never sees it, so the numbers can no longer be baked into the image. No backend/edge changes are required.

## Out of scope
No changes to the product picker labels (the product list still shows full names like `wire_mesh 002`), generation UI, storage, or other flows.