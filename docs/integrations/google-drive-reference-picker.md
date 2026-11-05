# Google Drive image-reference picker (disabled by default)

This proposal adds **Choose from Drive** to AI image generation and refinement.
It is not a live Drive connection. No credentials, OAuth grant, app configuration,
folder permissions, or deployment are supplied by this change.

## First-version scope

- Explicitly select PNG, JPEG or WebP files in an existing Shared Drive.
- Accept only files directly inside the one configured folder, not descendants
  or shortcuts. The UI tells the user to use that folder; the official Picker's
  Shared Drive view can browse more broadly. A wrong-folder selection is rejected
  before downloading its content.
- Import at most the remaining four-reference capacity, up to 10 MiB per image.
- Read bytes into temporary reference state. Selection does not call a generation
  provider, upload to Supabase/Drive, save an asset, or make a public link.
- The user must separately choose Generate/Apply edit to use imported references.
  This sends an imported snapshot through the existing generation path. Later
  revocation in Drive does not revoke a snapshot already imported into the app.
- Save to Drive, durable product imports, videos, subfolders, background sync,
  server-side provenance, and persistent connections are not implemented.

## Configuration and approvals required before enabling

Obtain action-time approval for creation/configuration of credentials, security
settings, and the app's OAuth grant. Identify the real Cloud project, app origin,
Google account, exact scope and destination. The folder link is not an OAuth grant.
Do not collect client secrets or access/refresh tokens in chat.

The public build-time identifiers are:

- `VITE_GOOGLE_DRIVE_PICKER_ENABLED=true`
- `VITE_GOOGLE_DRIVE_CLIENT_ID`: approved web OAuth client ID.
- `VITE_GOOGLE_DRIVE_PICKER_API_KEY`: restricted browser Picker key.
- `VITE_GOOGLE_DRIVE_APP_ID`: numeric Cloud project number for the same project.
- `VITE_GOOGLE_DRIVE_FOLDER_ID`: the exact approved destination/source folder ID.

No actual values or environment files are added. Incomplete/disabled configuration
shows a disabled button and “Drive setup required”; it loads no Google scripts.
The authorized administrator must enable the Google Picker and Drive APIs, apply
Google's documented origin/API restrictions to the browser key, configure the
exact standalone app origin, and approve any required security/consent settings.
Never place a client secret in VITE variables. These identifiers do not authorize
bypassing consent or permission checks.

The requested scope is only `https://www.googleapis.com/auth/drive.file`, with
incremental scope combination disabled. It is per selected/app-created file,
not an OAuth security boundary for one folder or a recursive-folder grant.
No `drive`, `drive.readonly`, metadata-wide scope, offline access or refresh token
is requested. Google consent still creates an access grant and needs approval.
A connected assistant's Drive plugin does not configure this app's OAuth client.

## Runtime behavior and limits

The first explicit click loads Google's official GIS and Picker scripts. It does
not start OAuth. A second fresh click starts Google's account/consent flow,
preserving browser user activation. Cancel, denial, timeout and expiry are visible
and retryable. Tokens are held only in operation memory, not in app storage,
Supabase, logs or query strings. Picker cleanup releases the operation reference.
Google may retain the user's consent until they revoke it in their account.

This first version rejects embedded previews. Google Picker requires the topmost
origin when embedded; an unverified ancestor origin is not guessed. Use the
separately approved standalone app URL for eventual acceptance testing. Supporting
Lovable's nested preview requires a later, verified origin/host integration, not a
sandbox bypass. There has been no live standalone or embedded Picker test yet.

While Google Picker is active, the app dialog is temporarily non-modal so its focus
trap does not block Google's overlay. Outside interactions cannot dismiss the app
dialog; explicit Cancel/Close aborts the operation. Keyboard, overlay and iframe
behavior still need real browser QA after configuration and authorization.

## Security controls

- Download by validated file ID from a fixed HTTPS Google Drive API endpoint.
  No raw sharing URLs, arbitrary fetch proxy, public link conversion or expanded
  generation-provider allowlist.
- Send the access token only in the Authorization header to the fixed Drive API
  and to the official Picker. Reject HTTP redirects; omit cookies and referrers.
- Check authoritative ID, direct parent, download capability, MIME, byte size,
  trash/shortcut state, and version before download; recheck after download.
- Stream bytes under a 10 MiB cap and 20-second transfer timeout. Validate MIME
  against PNG/JPEG/WebP magic bytes. Whole-selection timeout is three minutes.
  On main, the backend retains its existing authentication and request checks;
  this narrow handoff does not include the separate strict decoded-image,
  aggregate-byte, caller-scoped fetch or authorization-revalidation repairs.
  Review those backend safeguards separately before enabling live generation.
- Abort/ignore stale results when dialog, account or editor session changes.
  Serialize with native file reads and block generation/refinement/save during
  selection. Imports are all-or-nothing for a selection; no partial append.
- Do not treat client-side parent checks or Drive metadata as server authorization.
  A future strictly folder-confined server adapter must enforce its own root and
  per-user authorization, with separate credential-handling approval.
- A future durable copy needs verification of deployed Supabase bucket privacy
  and RLS. Existing public-URL conventions and long signed-URL lifetimes are not
  proof of safe private staging. Do not change those settings as a side effect.

## Validation and release gates

Tests mock OAuth, Picker and all Drive network responses. They cover disabled
configuration, separate user gestures, permission failures, token expiry, size,
MIME, redirects, wrong-folder IDs, shortcuts, metadata changes, cancellation,
repeat clicks, capacity and session isolation. Mock tests do not validate Google
account permissions, actual Shared Drive behavior, browser focus/overlays, or
production settings.

Before rollout: reconcile any concurrent Lovable edits; obtain configuration and
OAuth approvals; independently review the code; run normal aggregate checks; then
verify exact-folder selection, cancel/retry, account switching and preview bytes in
an approved standalone browser. No publish/deploy permission is implied.

Official references:
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/workspace/drive/picker/guides/web-picker
- https://developers.google.com/workspace/drive/picker/reference/picker.pickerbuilder.setorigin
- https://developers.google.com/workspace/drive/picker/reference/picker.docsview.setenabledrives
- https://developers.google.com/workspace/drive/api/guides/enable-shareddrives
