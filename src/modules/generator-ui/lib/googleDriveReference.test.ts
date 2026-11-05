import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseDriveImages, downloadDriveImage, DRIVE_FILE_SCOPE, DRIVE_IMAGE_LIMIT, getDrivePickerConfig, prepareDrivePicker, type DrivePickerConfig, type DrivePickerEvent, type DriveTokenResponse, type GoogleDriveSdk } from './googleDriveReference'

const config: DrivePickerConfig = { clientId: 'test.apps.googleusercontent.com', apiKey: 'test-public-key', appId: '123456', folderId: 'approved-folder' }
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))
const metadata = (extra = {}) => ({ id: 'file-1', name: 'cage.png', mimeType: 'image/png', size: String(png.length), parents: [config.folderId], trashed: false, capabilities: { canDownload: true }, version: '7', ...extra })
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
const media = (bytes: Uint8Array = png, headers: Record<string, string> = {}) => new Response(bytes as BodyInit, { headers: { 'content-type': 'image/png', ...headers } })
const signal = () => new AbortController().signal
function fetchMock(first = metadata(), body = () => media(), last = first) {
  return vi.fn().mockResolvedValueOnce(json(first)).mockImplementationOnce(body).mockResolvedValueOnce(json(last))
}

function mockSdk() {
  let auth!: { callback: (r: DriveTokenResponse) => void; error_callback: () => void }
  let callback!: (r: DrivePickerEvent) => void
  const view = { setEnableDrives: vi.fn().mockReturnThis(), setMimeTypes: vi.fn().mockReturnThis(), setMode: vi.fn().mockReturnThis() }
  const picker = { setVisible: vi.fn(), dispose: vi.fn() }
  const builder = { addView: vi.fn().mockReturnThis(), setOAuthToken: vi.fn().mockReturnThis(), setDeveloperKey: vi.fn().mockReturnThis(), setAppId: vi.fn().mockReturnThis(), setOrigin: vi.fn().mockReturnThis(), setMaxItems: vi.fn().mockReturnThis(), enableFeature: vi.fn().mockReturnThis(), setCallback: vi.fn((cb) => { callback = cb; return builder }), build: vi.fn(() => picker) }
  const requestAccessToken = vi.fn()
  const initTokenClient = vi.fn((args) => { auth = args; return { requestAccessToken } })
  const granted = vi.fn(() => true)
  const sdk: GoogleDriveSdk = {
    accounts: { oauth2: { initTokenClient, hasGrantedAllScopes: granted } },
    picker: { DocsView: function () { return view } as unknown as GoogleDriveSdk['picker']['DocsView'], PickerBuilder: function () { return builder } as unknown as GoogleDriveSdk['picker']['PickerBuilder'], DocsViewMode: { LIST: 'list' }, Feature: { MULTISELECT_ENABLED: 'multi' } },
  }
  return { sdk, initTokenClient, requestAccessToken, granted, picker, view, builder,
    authorize: (overrides = {}) => auth.callback({ access_token: 'test-ephemeral-token', expires_in: 3600, ...overrides }),
    authError: () => auth.error_callback(), event: (event: DrivePickerEvent) => callback(event),
  }
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network use') })) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.head.querySelectorAll('script').forEach(s => s.remove()) })

describe('Drive configuration and SDK preparation', () => {
  it('is disabled unless explicitly enabled and all public identifiers are present', () => {
    expect(getDrivePickerConfig({})).toBeNull()
    const env = { VITE_GOOGLE_DRIVE_PICKER_ENABLED: 'true', VITE_GOOGLE_DRIVE_CLIENT_ID: config.clientId, VITE_GOOGLE_DRIVE_PICKER_API_KEY: config.apiKey, VITE_GOOGLE_DRIVE_APP_ID: config.appId, VITE_GOOGLE_DRIVE_FOLDER_ID: config.folderId }
    expect(getDrivePickerConfig(env)).toEqual(config)
    expect(getDrivePickerConfig({ ...env, VITE_GOOGLE_DRIVE_PICKER_ENABLED: 'false' })).toBeNull()
    expect(getDrivePickerConfig({ ...env, VITE_GOOGLE_DRIVE_FOLDER_ID: 'https://evil.test/a' })).toBeNull()
    expect(getDrivePickerConfig({ ...env, VITE_GOOGLE_DRIVE_APP_ID: '' })).toBeNull()
  })
  it('prepares an already loaded official SDK without OAuth or network calls', async () => {
    const m = mockSdk()
    vi.stubGlobal('google', m.sdk)
    vi.stubGlobal('gapi', { load: vi.fn() })
    await prepareDrivePicker(signal())
    expect(m.initTokenClient).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('loads only official script URLs and does not authorize automatically', async () => {
    vi.stubGlobal('google', undefined)
    vi.stubGlobal('gapi', undefined)
    const m = mockSdk()
    const promise = prepareDrivePicker(signal())
    const gis = document.head.querySelector('script')!
    expect(gis.src).toBe('https://accounts.google.com/gsi/client')
    vi.stubGlobal('google', m.sdk)
    gis.dispatchEvent(new Event('load'))
    await Promise.resolve(); await Promise.resolve()
    const api = document.head.querySelectorAll('script')[1]
    expect(api.src).toBe('https://apis.google.com/js/api.js')
    vi.stubGlobal('gapi', { load: vi.fn() })
    api.dispatchEvent(new Event('load'))
    await promise
    expect(m.requestAccessToken).not.toHaveBeenCalled()
  })
  it('cancels script preparation and removes its pending script', async () => {
    vi.stubGlobal('google', undefined)
    const c = new AbortController()
    const promise = prepareDrivePicker(c.signal)
    c.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(document.head.querySelector('script')).toBeNull()
  })
})

describe('bounded Drive reference download', () => {
  it('downloads only fixed API URLs, validates metadata twice, and returns inline bytes', async () => {
    const fetcher = fetchMock()
    const image = await downloadDriveImage('file-1', 'test-ephemeral-token', config, signal(), fetcher)
    expect(image).toEqual({ name: 'cage.png', dataUrl: `data:image/png;base64,${btoa(String.fromCharCode(...png))}` })
    expect(fetcher).toHaveBeenCalledTimes(3)
    for (const [url, init] of fetcher.mock.calls) {
      expect(url).toMatch(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/file-1\?/)
      expect(url).not.toContain('test-ephemeral-token')
      expect(init).toMatchObject({ headers: { Authorization: 'Bearer test-ephemeral-token' }, redirect: 'error', credentials: 'omit', cache: 'no-store' })
    }
  })
  it.each([
    ['outside folder', { parents: ['other-folder'] }], ['shortcut', { shortcutDetails: { targetId: 'elsewhere' } }],
    ['trashed', { trashed: true }], ['download denied', { capabilities: { canDownload: false } }],
    ['unsupported MIME', { mimeType: 'image/svg+xml' }], ['oversized', { size: String(DRIVE_IMAGE_LIMIT + 1) }],
    ['empty', { size: '0' }], ['unknown version', { version: undefined }], ['wrong ID', { id: 'other-file' }],
  ])('rejects %s before media transfer', async (_label, extra) => {
    const fetcher = fetchMock(metadata(extra))
    await expect(downloadDriveImage('file-1', 'token', config, signal(), fetcher)).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects raw URLs and path injection without making a request', async () => {
    const fetcher = vi.fn()
    for (const id of ['https://evil.test/', '../file', 'file?alt=media', 'file#token']) {
      await expect(downloadDriveImage(id, 'token', config, signal(), fetcher)).rejects.toThrow('Invalid Drive')
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects MIME mismatch and non-image bytes', async () => {
    await expect(downloadDriveImage('file-1', 'token', config, signal(), fetchMock(metadata(), () => media(png, { 'content-type': 'text/html' })))).rejects.toThrow('content type')
    const fake = new Uint8Array(png.length)
    await expect(downloadDriveImage('file-1', 'token', config, signal(), fetchMock(metadata(), () => media(fake)))).rejects.toThrow('invalid or changed')
  })
  it('rejects changed metadata or revoked access after reading bytes', async () => {
    await expect(downloadDriveImage('file-1', 'token', config, signal(), fetchMock(metadata(), () => media(), metadata({ version: '8' })))).rejects.toThrow('changed during import')
    await expect(downloadDriveImage('file-1', 'token', config, signal(), fetchMock(metadata(), () => media(), metadata({ capabilities: { canDownload: false } })))).rejects.toThrow('not permitted')
  })
  it('enforces declared and streamed size limits', async () => {
    await expect(downloadDriveImage('file-1', 'token', config, signal(), fetchMock(metadata(), () => media(png, { 'content-length': String(DRIVE_IMAGE_LIMIT + 1) })))).rejects.toThrow('10 MB')
    await expect(downloadDriveImage('file-1', 'token', config, signal(), fetchMock(metadata(), () => media(new Uint8Array(DRIVE_IMAGE_LIMIT + 1))))).rejects.toThrow('10 MB')
  })
  it('rejects redirects and expired tokens, without exposing API bodies', async () => {
    const redirected = json(metadata()); Object.defineProperty(redirected, 'redirected', { value: true })
    await expect(downloadDriveImage('file-1', 'secret', config, signal(), vi.fn().mockResolvedValue(redirected))).rejects.toThrow('unavailable')
    await expect(downloadDriveImage('file-1', 'secret', config, signal(), vi.fn().mockResolvedValue(new Response('secret body', { status: 401 })))).rejects.toThrow('expired')
    await expect(downloadDriveImage('file-1', 'secret', config, signal(), vi.fn().mockRejectedValue(new Error('secret body')))).rejects.toThrow('could not be downloaded safely')
  })
  it('times out a stalled download without returning partial data', async () => {
    vi.useFakeTimers()
    const fetcher = fetchMock(metadata(), () => new Response(new ReadableStream(), { headers: { 'content-type': 'image/png' } }))
    const pending = downloadDriveImage('file-1', 'token', config, signal(), fetcher)
    const rejected = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(20_000)
    await rejected
  })
  it('aborts a stalled stream on cancellation and never returns partial data', async () => {
    let cancel!: () => void
    const c = new AbortController()
    const started = new Promise<void>(resolve => { cancel = resolve })
    const fetcher = fetchMock(metadata(), () => { cancel(); return new Response(new ReadableStream(), { headers: { 'content-type': 'image/png' } }) })
    const pending = downloadDriveImage('file-1', 'token', config, c.signal, fetcher)
    await started
    c.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('official picker and memory-only authorization', () => {
  it('requests only drive.file synchronously and returns validated selected images', async () => {
    const m = mockSdk()
    vi.stubGlobal('fetch', fetchMock())
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    const pending = chooseDriveImages(config, 2, signal(), m.sdk)
    expect(m.requestAccessToken).toHaveBeenCalledWith({ prompt: 'select_account' })
    expect(m.initTokenClient.mock.calls[0][0]).toMatchObject({ scope: DRIVE_FILE_SCOPE, include_granted_scopes: false })
    m.authorize()
    expect(m.view.setEnableDrives).toHaveBeenCalledWith(true)
    expect(m.view.setMimeTypes).toHaveBeenCalledWith('image/png,image/jpeg,image/webp')
    expect(m.builder.setMaxItems).toHaveBeenCalledWith(2)
    m.event({ action: 'picked', docs: [{ id: 'file-1' }] })
    await expect(pending).resolves.toHaveLength(1)
    expect(m.picker.dispose).toHaveBeenCalledOnce()
    expect(storage).not.toHaveBeenCalled()
  })
  it('handles cancel without downloading anything', async () => {
    const m = mockSdk()
    const pending = chooseDriveImages(config, 4, signal(), m.sdk)
    m.authorize(); m.event({ action: 'cancel' })
    await expect(pending).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{ error: 'access_denied' }, { expires_in: 0 }, { expires_in: undefined }, { expires_in: 'NaN' }, { expires_in: Infinity }, { access_token: '' }])('rejects unusable authorization %j', async (response) => {
    const m = mockSdk()
    const pending = chooseDriveImages(config, 1, signal(), m.sdk)
    m.authorize(response)
    await expect(pending).rejects.toThrow('not granted')
    expect(m.builder.build).not.toHaveBeenCalled()
  })
  it('rejects a missing scope or a closed OAuth popup', async () => {
    const m = mockSdk(); m.granted.mockReturnValue(false)
    const denied = chooseDriveImages(config, 1, signal(), m.sdk); m.authorize()
    await expect(denied).rejects.toThrow('not granted')
    const closed = chooseDriveImages(config, 1, signal(), m.sdk); m.authError()
    await expect(closed).rejects.toThrow('cancelled or blocked')
  })
  it('ignores late authorization after abort', async () => {
    const m = mockSdk(); const c = new AbortController()
    const pending = chooseDriveImages(config, 1, c.signal, m.sdk)
    c.abort(); m.authorize()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(m.builder.build).not.toHaveBeenCalled()
  })
  it('rejects excess or malformed selected IDs without a download', async () => {
    const m = mockSdk()
    const pending = chooseDriveImages(config, 1, signal(), m.sdk)
    m.authorize(); m.event({ action: 'picked', docs: [{ id: 'file-1' }, { id: 'file-2' }] })
    await expect(pending).rejects.toThrow('Invalid Drive selection')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('settles cancellation even when the picker cleanup throws', async () => {
    const m = mockSdk()
    m.picker.dispose.mockImplementation(() => { throw new Error('cleanup') })
    const pending = chooseDriveImages(config, 1, signal(), m.sdk)
    m.authorize(); m.event({ action: 'cancel' })
    await expect(pending).resolves.toEqual([])
    expect(m.picker.setVisible).toHaveBeenLastCalledWith(false)
  })
  it('turns a thrown SDK scope check into a safe failure', async () => {
    const m = mockSdk()
    m.granted.mockImplementation(() => { throw new Error('SDK failed') })
    const pending = chooseDriveImages(config, 1, signal(), m.sdk)
    m.authorize()
    await expect(pending).rejects.toThrow('could not open')
  })
  it('times out an abandoned OAuth flow', async () => {
    vi.useFakeTimers()
    const m = mockSdk()
    const pending = chooseDriveImages(config, 1, signal(), m.sdk)
    const rejected = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(180_000)
    await rejected
  })
})
