## Expected outcome
- Clicking **Download original (WEBM)** saves the `.webm` file from NAS.
- Clicking **Download as MP4** converts the NAS-backed WEBM to MP4, then saves the `.mp4` file.
- The progress indicator must not remain at `0`; if conversion fails, the UI must show the real reason.

## Root cause found
- The MP4 worker is trying to run `cp` on this NAS path:
  `/volume1/ERP/media/merged-videos/55779.../merged-1781810244734.webm`
- The database says that path is active on NAS, but the NAS command returns:
  `cp: cannot stat ... No such file or directory`
- So MP4 conversion fails immediately, and the frontend stays at `0` before the job is marked failed.
- WEBM downloads are also vulnerable because direct browser streaming from the NAS proxy can be interrupted when the browser aborts/ranges the video request.

## Safe implementation plan
1. **Fix MP4 worker source handling**
   - In `mp4-export-worker`, do not assume the stored `nas_path` is readable from the SSH shell.
   - When a source is NAS-backed, read the file through the existing `synology-storage-stream` endpoint using the file id and an internal/service token, then feed that URL to `ffmpeg` via `curl` on the NAS.
   - Keep Cloud fallback unchanged for files still in Cloud.

2. **Fix cached/failed MP4 export behavior**
   - Before creating a new job, if the deterministic output path already has an older failed job, still allow a fresh retry.
   - Return clearer failure messages from the worker/status path so the UI does not only show generic “MP4 conversion failed”.

3. **Make original WEBM download more robust**
   - Keep the frontend Blob download helper.
   - Ensure NAS stream download requests include a filename and use the authenticated stream URL.
   - If Blob fetch fails, show an error toast instead of silently opening a broken/raw URL.

4. **Deploy and test**
   - Deploy changed edge function(s).
   - Test `synology-storage-stream` for the affected WEBM file.
   - Trigger an MP4 export for the same final-film file and verify the job reaches `completed`.
   - Confirm the generated MP4 path is downloadable.
   - Then test from the preview by clicking both menu options.

## Constraints / what must not break
- Do not disable download buttons.
- Do not move files back to Cloud.
- Do not expose service credentials to the frontend.
- Do not delete any NAS files.
- Keep all new uploads routed to Synology.

## Execution mode
SAFE MODE: diagnose → minimal edge-function/frontend patch → deploy only touched functions → test with real affected file → verify in preview.