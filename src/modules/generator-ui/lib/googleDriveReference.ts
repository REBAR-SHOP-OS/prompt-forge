/** Interactive, selected-file imports only. Never stores tokens or uploads files. */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const DRIVE_IMAGE_LIMIT = 10 * 1024 * 1024
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const FILE_ID = /^[A-Za-z0-9_-]{1,200}$/
const API_ROOT = 'https://www.googleapis.com/drive/v3/files/'
class DriveReferenceError extends Error {}

export type DrivePickerConfig = { clientId: string; apiKey: string; appId: string; folderId: string }
export type DriveReferenceImage = { name: string; dataUrl: string }
export type DriveTokenResponse = { access_token?: string; expires_in?: number | string; error?: string }
export type DrivePickerEvent = { action?: string; docs?: Array<{ id?: string }> }
type PickerView = { setEnableDrives(value: boolean): PickerView; setMimeTypes(value: string): PickerView; setMode(value: string): PickerView }
type Picker = { setVisible(value: boolean): void; dispose(): void }
type PickerBuilder = {
  addView(view: PickerView): PickerBuilder
  setOAuthToken(token: string): PickerBuilder
  setDeveloperKey(key: string): PickerBuilder
  setAppId(id: string): PickerBuilder
  setOrigin(origin: string): PickerBuilder
  setMaxItems(count: number): PickerBuilder
  enableFeature(feature: string): PickerBuilder
  setCallback(callback: (event: DrivePickerEvent) => void): PickerBuilder
  build(): Picker
}
export type GoogleDriveSdk = {
  accounts: { oauth2: {
    initTokenClient(config: { client_id: string; scope: string; include_granted_scopes: boolean; callback: (response: DriveTokenResponse) => void; error_callback: () => void }): { requestAccessToken(options: { prompt: string }): void }
    hasGrantedAllScopes(response: DriveTokenResponse, scope: string): boolean
  } }
  picker: { DocsView: new () => PickerView; PickerBuilder: new () => PickerBuilder; DocsViewMode: { LIST: string }; Feature: { MULTISELECT_ENABLED: string } }
}
type GoogleWindow = Window & {
  google?: GoogleDriveSdk
  gapi?: { load(name: string, options: { callback: () => void; onerror: () => void; timeout: number; ontimeout: () => void }): void }
}

/** Public identifiers only. No real values or configuration are supplied by this change. */
export function getDrivePickerConfig(env: Record<string, unknown> = import.meta.env): DrivePickerConfig | null {
  if (env.VITE_GOOGLE_DRIVE_PICKER_ENABLED !== 'true') return null
  const value = (key: string) => typeof env[key] === 'string' ? (env[key] as string).trim() : ''
  const config = {
    clientId: value('VITE_GOOGLE_DRIVE_CLIENT_ID'), apiKey: value('VITE_GOOGLE_DRIVE_PICKER_API_KEY'),
    appId: value('VITE_GOOGLE_DRIVE_APP_ID'), folderId: value('VITE_GOOGLE_DRIVE_FOLDER_ID'),
  }
  return config.clientId.endsWith('.apps.googleusercontent.com') && config.apiKey && /^\d+$/.test(config.appId) && FILE_ID.test(config.folderId) ? config : null
}

function abortError() { return new DOMException('Drive selection cancelled.', 'AbortError') }
function checkAbort(signal: AbortSignal) { if (signal.aborted) throw abortError() }

function loadScript(src: string, signal: AbortSignal): Promise<void> {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      script.onload = null
      script.onerror = null
      if (error) { script.remove(); reject(error) } else resolve()
    }
    const cancel = () => finish(abortError())
    const timer = setTimeout(() => finish(new DriveReferenceError('Google picker could not load. Please try again.')), 15_000)
    script.onload = () => finish()
    script.onerror = () => finish(new DriveReferenceError('Google picker could not load. Please try again.'))
    signal.addEventListener('abort', cancel, { once: true })
    document.head.appendChild(script)
  })
}

/** Load only on an explicit click. OAuth is a separate, fresh user gesture. */
export async function prepareDrivePicker(signal: AbortSignal): Promise<void> {
  checkAbort(signal)
  if (window.top !== window.self) throw new DriveReferenceError('Use the approved standalone app URL for Google Drive. Embedded preview support is not enabled.')
  const win = window as GoogleWindow
  if (!win.google?.accounts?.oauth2) await loadScript('https://accounts.google.com/gsi/client', signal)
  if (!win.gapi) await loadScript('https://apis.google.com/js/api.js', signal)
  checkAbort(signal)
  if (!win.google?.picker) {
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { cleanup(); reject(abortError()) }
      const cleanup = () => signal.removeEventListener('abort', cancel)
      const fail = () => { cleanup(); reject(new DriveReferenceError('Google picker could not load. Please try again.')) }
      signal.addEventListener('abort', cancel, { once: true })
      if (!win.gapi) { fail(); return }
      try { win.gapi.load('picker', { callback: () => { cleanup(); resolve() }, onerror: fail, timeout: 15_000, ontimeout: fail }) } catch { fail() }
    })
  }
  checkAbort(signal)
  if (!win.google?.accounts?.oauth2 || !win.google?.picker) throw new DriveReferenceError('Google picker is unavailable.')
}

function sniffImage(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 12 && [82, 73, 70, 70].every((n, i) => bytes[i] === n) && [87, 69, 66, 80].every((n, i) => bytes[i + 8] === n)) return 'image/webp'
  return null
}

async function boundedBody(response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel()
    throw new DriveReferenceError('Drive image exceeds the 10 MB limit.')
  }
  if (!response.body) throw new DriveReferenceError('Drive returned an empty response.')
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      checkAbort(signal)
      const { value, done } = await reader.read()
      checkAbort(signal)
      if (done) break
      size += value.byteLength
      if (size > limit) throw new DriveReferenceError('Drive image exceeds the 10 MB limit.')
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength })
    return bytes
  } finally {
    signal.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

type DriveFile = { id?: string; name?: string; mimeType?: string; size?: string; parents?: string[]; trashed?: boolean; shortcutDetails?: unknown; capabilities?: { canDownload?: boolean }; version?: string }

/** A fixed Google API endpoint, never a user-controlled URL or backend proxy. */
export async function downloadDriveImage(fileId: string, token: string, config: DrivePickerConfig, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<DriveReferenceImage> {
  if (!FILE_ID.test(fileId) || !FILE_ID.test(config.folderId)) throw new DriveReferenceError('Invalid Drive file selection.')
  checkAbort(signal)
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(cancel, 20_000)
  const init: RequestInit = { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' }
  const url = `${API_ROOT}${encodeURIComponent(fileId)}`
  const metadataUrl = `${url}?supportsAllDrives=true&fields=id,name,mimeType,size,parents,trashed,shortcutDetails,capabilities(canDownload),version`
  const request = async (target: string) => {
    checkAbort(controller.signal)
    const response = await fetchImpl(target, init)
    if (response.status === 401) throw new DriveReferenceError('Google access expired. Choose the image again to reconnect.')
    if (!response.ok || response.redirected || response.type === 'opaqueredirect') throw new DriveReferenceError('The selected Drive file is unavailable or access was denied.')
    return response
  }
  const getMetadata = async (): Promise<DriveFile> => {
    const response = await request(metadataUrl)
    const bytes = await boundedBody(response, 64 * 1024, controller.signal)
    return JSON.parse(new TextDecoder().decode(bytes)) as DriveFile
  }
  const validate = (file: DriveFile) => {
    if (file.id !== fileId || typeof file.version !== 'string' || !/^\d+$/.test(file.version) || file.trashed || file.shortcutDetails || !Array.isArray(file.parents) || !file.parents.includes(config.folderId)) throw new DriveReferenceError('Choose an image directly inside the configured Drive folder. Shortcuts and subfolders are not supported.')
    if (file.capabilities?.canDownload !== true) throw new DriveReferenceError('Downloading this Drive image is not permitted.')
    if (!IMAGE_TYPES.includes(file.mimeType ?? '')) throw new DriveReferenceError('Choose a PNG, JPEG, or WebP image.')
    const size = Number(file.size)
    if (!Number.isSafeInteger(size) || size <= 0 || size > DRIVE_IMAGE_LIMIT) throw new DriveReferenceError('Drive image must be between 1 byte and 10 MB.')
  }
  try {
    const metadata = await getMetadata()
    validate(metadata)
    const response = await request(`${url}?alt=media&supportsAllDrives=true`)
    const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (mime !== metadata.mimeType) throw new DriveReferenceError('Drive image content type does not match its metadata.')
    const bytes = await boundedBody(response, DRIVE_IMAGE_LIMIT, controller.signal)
    if (bytes.length !== Number(metadata.size) || sniffImage(bytes) !== mime) throw new DriveReferenceError('Drive returned an invalid or changed image.')
    // Reject moves, revocation, or replacement that occurred during the transfer.
    const current = await getMetadata()
    validate(current)
    if (current.version !== metadata.version || current.size !== metadata.size || current.mimeType !== metadata.mimeType) throw new DriveReferenceError('Drive image changed during import. Choose it again.')
    checkAbort(controller.signal)
    const pieces: string[] = []
    for (let i = 0; i < bytes.length; i += 0x8000) pieces.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)))
    return { name: (metadata.name || 'Drive image').slice(0, 255), dataUrl: `data:${mime};base64,${btoa(pieces.join(''))}` }
  } catch (error) {
    if (signal.aborted) throw abortError()
    if (controller.signal.aborted) throw new DriveReferenceError('Drive image download timed out. Try again.')
    // Never expose raw API bodies, access tokens, or response URLs in UI errors.
    if (error instanceof DriveReferenceError) throw error
    throw new DriveReferenceError('Drive image could not be downloaded safely. Try again.')
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}

/** Must be called directly in the click handler after prepareDrivePicker completes. */
export function chooseDriveImages(config: DrivePickerConfig, maxFiles: number, signal: AbortSignal, sdk = (window as GoogleWindow).google): Promise<DriveReferenceImage[]> {
  checkAbort(signal)
  if (!sdk?.accounts?.oauth2 || !sdk.picker) return Promise.reject(new DriveReferenceError('Load the Google picker first.'))
  if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 4) return Promise.reject(new DriveReferenceError('Up to four reference images are allowed.'))
  if (window.top !== window.self) return Promise.reject(new DriveReferenceError('Use the approved standalone app URL for Google Drive.'))
  return new Promise((resolve, reject) => {
    let token = '' // Operation-scoped only; never written to storage or Supabase.
    let picker: Picker | undefined
    let settled = false
    let selecting = false
    const controller = new AbortController()
    const finish = (images: DriveReferenceImage[], error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      controller.abort()
      const closingPicker = picker
      picker = undefined
      token = ''
      try { closingPicker?.setVisible(false) } catch { /* Best-effort dismissal. */ }
      try { closingPicker?.dispose() } catch { /* Cleanup must never prevent settlement. */ }
      if (error) reject(error); else resolve(images)
    }
    const cancel = () => finish([], abortError())
    const timer = setTimeout(() => finish([], new DriveReferenceError('Drive selection timed out. Try again.')), 180_000)
    signal.addEventListener('abort', cancel, { once: true })
    const picked = async (event: DrivePickerEvent) => {
      if (settled || selecting) return
      if (event.action === 'cancel') { finish([]); return }
      if (event.action !== 'picked') return
      selecting = true
      try { picker?.setVisible(false) } catch { finish([], new DriveReferenceError('Google picker could not close safely. Try again.')); return }
      const ids = [...new Set((Array.isArray(event.docs) ? event.docs : []).map(doc => doc?.id))]
      if (!ids.length || ids.length > maxFiles || ids.some(id => !id || !FILE_ID.test(id))) { finish([], new DriveReferenceError('Invalid Drive selection or too many images.')); return }
      try {
        const images: DriveReferenceImage[] = []
        for (const id of ids) images.push(await downloadDriveImage(id!, token, config, controller.signal))
        finish(images)
      } catch (error) { finish([], error instanceof Error ? error : new DriveReferenceError('Drive import failed.')) }
    }
    try {
      const client = sdk.accounts.oauth2.initTokenClient({
        client_id: config.clientId, scope: DRIVE_FILE_SCOPE, include_granted_scopes: false,
        error_callback: () => finish([], new DriveReferenceError('Google connection was cancelled or blocked. Try again.')),
        callback: response => {
          if (settled || selecting || picker) return
          try {
          if (response.error || !response.access_token || !Number.isFinite(Number(response.expires_in)) || Number(response.expires_in) <= 0 || !sdk.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_FILE_SCOPE)) { finish([], new DriveReferenceError('Google Drive access was not granted.')); return }
          token = response.access_token
            // Shared-drive mode and setParent must not be combined. The selected
            // file's actual parents are checked via Drive before reading bytes.
            const view = new sdk.picker.DocsView().setEnableDrives(true).setMimeTypes(IMAGE_TYPES.join(',')).setMode(sdk.picker.DocsViewMode.LIST)
            picker = new sdk.picker.PickerBuilder().addView(view).setOAuthToken(token).setDeveloperKey(config.apiKey).setAppId(config.appId).setOrigin(window.location.origin).setMaxItems(maxFiles).enableFeature(sdk.picker.Feature.MULTISELECT_ENABLED).setCallback(event => { void picked(event) }).build()
            picker.setVisible(true)
          } catch { finish([], new DriveReferenceError('Google picker could not open. Try again.')) }
        },
      })
      // No await before this call: retain the browser's user activation.
      client.requestAccessToken({ prompt: 'select_account' })
    } catch { finish([], new DriveReferenceError('Google connection could not start. Try again.')) }
  })
}
