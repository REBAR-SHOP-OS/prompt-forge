I found the root cause: the generation request is not reaching `jobs-create` as an application request. The browser network snapshot shows `POST /functions/v1/jobs-create` failing with `Failed to fetch`, and the backend has only a boot/preflight log at that time, with no corresponding job-create request log. A direct preflight check also shows the response is missing `Access-Control-Allow-Origin` for the app’s preview/published origins. So the browser is blocking video generation at CORS before the function can start the job.

Plan:

1. Fix CORS at the shared backend layer
   - Update `supabase/functions/_shared/core/http.ts` so deployed app origins are allowed, not only localhost/default origins.
   - Preserve support for configured `CORS_ALLOW_ORIGINS` / `CORS_ALLOW_ORIGIN`.
   - Add safe project-origin matching for:
     - the Lovable preview domain currently used by the app,
     - the published app domain,
     - the Lovable internal preview domain seen in the failed request.
   - Keep security headers and preflight behavior intact.

2. Apply the fix consistently to all functions using the shared CORS helper
   - Redeploy the affected backend functions that import `preflightResponse` / `jsonResponse`, especially:
     - `jobs-create`
     - `jobs-get`
     - `jobs-list`
     - `jobs-delete`
     - `me`
     - `usage-credits`
     - `ai-gateway-route-preview`
     - `video-proxy`
   - This avoids fixing generation while leaving polling/history/playback blocked by the same CORS issue.

3. Improve frontend error reporting without changing the UI design
   - Update the shared API client to convert browser-level fetch failures into a structured `NETWORK_ERROR` message instead of the generic “Could not start video generation.”
   - Keep the current Apple-style UI layout unchanged.
   - The visible error will become more useful if a true network/CORS/backend reachability issue happens again.

4. Validate without spending generation credits
   - Test `OPTIONS /jobs-create` from the preview and published origins and confirm `Access-Control-Allow-Origin` is present.
   - Test a safe invalid `POST /jobs-create` request that returns validation/auth feedback but does not start a provider generation.
   - Confirm recent backend logs show the request is reaching the function after the CORS fix.

No database schema changes are needed. The existing video generation/provider logic will be preserved.