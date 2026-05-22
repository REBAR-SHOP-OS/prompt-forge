# Fix "Video is larger than 200MB" upload error

## Problem
`handleUploadVideoFile` in `src/modules/generator-ui/pages/DashboardPage.tsx` (line 1730) rejects any video over 200MB with the message shown in the screenshot.

## Plan
1. Raise the client-side cap to **1GB** (`1024 * 1024 * 1024`) and update the warning text to match ("Video is larger than 1GB…").
2. No backend changes — uploads go directly to storage; the Supabase Storage bucket already accepts files of this size for video assets used elsewhere in the project.

## Technical notes
- File: `src/modules/generator-ui/pages/DashboardPage.tsx`, lines 1730–1733 only.
- Single constant + single string. No other call site uses `MAX_BYTES`.
- If you'd prefer a different cap (e.g. 500MB or 2GB), tell me the number and I'll use it instead.
