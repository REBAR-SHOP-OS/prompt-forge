import { describe, it, expect } from 'vitest'
// ?raw import is resolved by Vite at bundle/transform time — no node:fs, node:path,
// or __dirname needed at runtime. Works identically in jsdom and node environments.
import source from './DashboardPage.tsx?raw'

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
    expect(source).toContain('<TooltipContent side="bottom"')
  })

  it('renders Library as a larger circular first control before the profile avatar', () => {
    const containerStart = source.indexOf('fixed left-4 top-4 flex items-center gap-2')
    const containerSlice = source.slice(containerStart, containerStart + 4000)
    const libraryIdx = containerSlice.indexOf('aria-label="Library"')
    const avatarIdx = containerSlice.indexOf('aria-label="Open account menu"')
    const libraryButton = containerSlice.match(/aria-label="Library"[\s\S]*?<\/button>/)?.[0]

    expect(containerStart).toBeGreaterThan(-1)
    expect(libraryIdx).toBeGreaterThan(-1)
    expect(avatarIdx).toBeGreaterThan(-1)
    expect(libraryIdx).toBeLessThan(avatarIdx)
    expect(libraryButton).toContain('h-11 w-11')
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
})
