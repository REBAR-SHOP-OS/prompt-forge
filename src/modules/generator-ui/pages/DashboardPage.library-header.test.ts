import { describe, it, expect } from 'vitest'
// ?raw import is resolved by Vite at bundle/transform time — no node:fs, node:path,
// or __dirname needed at runtime. Works identically in jsdom and node environments.
import source from './DashboardPage.tsx?raw'

// The top-left control group — a vertical rail. Kept as one constant so a
// layout change fails here with a clear message rather than in whichever
// assertion happens to run first.
const HEADER_CONTAINER = 'fixed left-4 top-4 flex flex-col items-center gap-2.5'

// Regression coverage for moving Library out of the profile/email dropdown and
// into a permanent header icon. The Library panel itself (isApprovedPanelOpen)
// must keep the exact same open/close state and data source (approvedIds.size).
describe('DashboardPage Library header icon', () => {
  it('toggles the existing Library panel via the same isApprovedPanelOpen state', () => {
    // The header icon must reuse the existing panel state, not a parallel one.
    expect(source).toContain('setIsApprovedPanelOpen((open) => !open)')
    // The existing panel still opens/closes off the same state.
    expect(source).toContain('const [isApprovedPanelOpen, setIsApprovedPanelOpen] = useState(false)')
  })

  it('shows the Library badge from the existing approvedIds source', () => {
    // Badge count must come from the same data source as before (approvedIds.size).
    expect(source).toContain('{approvedIds.size}')
  })

  it('adds a Library tooltip on the header icon', () => {
    expect(source).toContain('aria-label="Library"')
    expect(source).toContain('title="Library"')
    // The rail is vertical, so the tooltip opens to the side rather than below
    // — a bottom tooltip would cover the next control in the stack.
    expect(source).toContain('<TooltipContent side="right"')
  })

  it('renders Library as an equally sized circular control directly after the profile avatar', () => {
    // Assert each lookup succeeded BEFORE using its result. indexOf returns -1
    // and match returns undefined when the markup is renamed, and slicing from
    // -1 quietly hands back almost the whole file while `.toContain` on
    // undefined throws a TypeError — either way the failure names the wrong
    // thing and sends the next reader hunting.
    const containerStart = source.indexOf(HEADER_CONTAINER)
    expect(containerStart, 'header container marker not found').toBeGreaterThan(-1)

    const containerSlice = source.slice(containerStart, containerStart + 8000)
    const libraryIdx = containerSlice.indexOf('aria-label="Library"')
    const avatarIdx = containerSlice.indexOf('aria-label="Open account menu"')
    expect(libraryIdx, 'Library control not found in the header container').toBeGreaterThan(-1)
    expect(avatarIdx, 'account avatar not found in the header container').toBeGreaterThan(-1)
    // Avatar first, Library second.
    expect(avatarIdx).toBeLessThan(libraryIdx)

    const libraryButton = containerSlice.match(/aria-label="Library"[\s\S]*?<\/button>/)?.[0]
    expect(libraryButton, 'Library <button> markup not matched').toBeDefined()
    // 40x40, matching the profile control it sits above — see the paired
    // assertion in DashboardPage.account-avatar.test.ts.
    expect(libraryButton).toContain('h-10 w-10')
    expect(libraryButton).toContain('rounded-full')
    expect(libraryButton).toContain('<Library className="h-5 w-5"')
  })

  it('gives the header icon a clear active state when the panel is open', () => {
    expect(source).toContain('isApprovedPanelOpen')
    expect(source).toContain('border-red-500/50 bg-red-500/15 text-danger')
  })

  it('removes the Library item from the profile/email dropdown', () => {
    // The dropdown must no longer open the Library panel. Only account items
    // (Account Center + Sign out) remain.
    expect(source).not.toContain('onSelect={() => setIsApprovedPanelOpen(true)}')
    expect(source).toContain('onSelect={() => setIsAccountCenterOpen(true)}')
    expect(source).toContain('Sign out')
  })

  it('keeps Library open when a saved project is selected for Preview', () => {
    const handlerStart = source.indexOf('function openLibraryEntry(video: JobDetail)')
    const handlerEnd = source.indexOf('function parseScenarioScenes', handlerStart)
    expect(handlerStart, 'openLibraryEntry handler not found').toBeGreaterThan(-1)
    expect(handlerEnd, 'openLibraryEntry handler end not found').toBeGreaterThan(handlerStart)

    const handler = source.slice(handlerStart, handlerEnd)
    expect(handler).toContain('setPreviewDismissed(false)')
    expect(handler).toContain('setPreviewVideoId(video.id)')
    expect(handler).toContain('setSelectedProjectId(video.id)')
    expect(handler).not.toContain('setIsApprovedPanelOpen(false)')
  })

  it('still closes Library from both the backdrop and explicit close button', () => {
    const panelStart = source.indexOf('{/* Left library panel')
    const panelEnd = source.indexOf('{!isReadOnlyProject && (', panelStart)
    expect(panelStart, 'Library panel start not found').toBeGreaterThan(-1)
    expect(panelEnd, 'Library panel end not found').toBeGreaterThan(panelStart)

    const panel = source.slice(panelStart, panelEnd)
    expect(panel.match(/aria-label="Close library"/g)).toHaveLength(2)
    expect(panel.match(/onClick=\{\(\) => setIsApprovedPanelOpen\(false\)\}/g)).toHaveLength(2)
  })
})
