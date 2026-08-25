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

  it('gives the header icon a clear active state when the panel is open', () => {
    expect(source).toContain('isApprovedPanelOpen')
    expect(source).toContain('border-red-500/40 bg-red-500/10 text-red-400')
  })

  it('removes the Library item from the profile/email dropdown', () => {
    // The dropdown must no longer open the Library panel. Only account items
    // (Account Center + Sign out) remain.
    expect(source).not.toContain('onSelect={() => setIsApprovedPanelOpen(true)}')
    expect(source).toContain('onSelect={() => setIsAccountCenterOpen(true)}')
    expect(source).toContain('Sign out')
  })
})
