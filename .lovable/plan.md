## Problem

When a logo is selected and **Make sheet** is clicked, the logo is never actually applied to the generated character sheet.

## Root cause

The `user-images` storage bucket is **private** — everywhere in the dialog images are accessed through time-limited **signed URLs** (`signUrl` → `createSignedUrl`). The source character image works for exactly this reason.

But the logo is sent to the backend as a **public URL**:

```text
line 217:  setLogoSendUrl(pub.publicUrl)   // public URL on a PRIVATE bucket
line 244:  ...(useLogo ? { logoUrl: logoSendUrl, applyLogo: true } : {})
```

In the edge function (`generate-character-sheet/index.ts`), the logo fetch is wrapped in a silent try/catch:

```text
line 103:  const logoResp = await fetch(logoUrl);   // 400/403 on private bucket
line 110:  } catch { /* ignore — proceed without logo */ }
line 112:  const useLogo = applyLogo && !!logoDataUrl;  // becomes false
```

Because the public URL returns 403 on a private bucket, `logoDataUrl` stays empty, `useLogo` becomes `false`, and the sheet is generated **without** the logo — no visible error.

## Fix

Send the logo to the backend using a **signed URL** (the same mechanism every other image already uses), instead of the unreachable public URL.

### `src/modules/generator-ui/components/CharacterSheetDialog.tsx`
- In `handleLogoSelected`, set `logoSendUrl` to a signed URL: `setLogoSendUrl(await signUrl(pub.publicUrl))` (reuse the value already computed for the preview so we sign once).
- `isAllowedImageUrl` in the edge function already accepts signed URLs (same `*.supabase.co` host), so no backend host-allowlist change is needed.

### Optional robustness (backend, no behavior change when it works)
- Keep the existing logo handling, but this fix alone makes the logo fetch succeed so `useLogo` becomes `true` and the existing prompt instructions ("place this logo on the character's clothing, consistent across all turnaround views") take effect.

## Result

After this change, selecting a logo + clicking **Make sheet** produces a character sheet where the company logo is rendered on the character's clothing across all views, so the character is recognizable by that logo.