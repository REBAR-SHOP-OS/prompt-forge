import { describe, it, expect } from 'vitest'
// ?raw import is resolved by Vite at bundle/transform time — no node:fs, node:path,
// or __dirname needed at runtime. Works identically in jsdom and node environments.
import source from './DashboardPage.tsx?raw'

// The top-left control group. Declared once so a layout change breaks in a
// single place with a clear message, instead of four copies of the literal
// each failing on a downstream assertion that names the wrong thing.
const HEADER_CONTAINER = 'fixed left-4 top-4 flex flex-col items-center gap-2.5'

// Regression coverage for the top-left account control: the Avatar remains in
// the same vertical control rail immediately after the Library control, and
// the two are the same size.
describe('DashboardPage account avatar header control', () => {
  it('keeps the existing circular avatar profile control', () => {
    expect(source).toContain('aria-label="Open account menu"')
    expect(source).toContain('<Avatar className="h-10 w-10 ring-1 ring-border">')
    expect(source).toContain('rounded-full')
  })

  it('derives initials from first/last name with email fallback', () => {
    expect(source).toContain('initialsForName(')
    expect(source).toContain('profile?.first_name')
    expect(source).toContain('profile?.last_name')
    expect(source).toContain('profile?.email ?? session?.user.email')
  })

  it('shows the avatar image when avatar_url is present', () => {
    expect(source).toContain('profile?.avatar_url')
    expect(source).toContain('<AvatarImage src={profile.avatar_url}')
  })

  it('keeps the Account Center trigger on the existing state', () => {
    expect(source).toContain('onSelect={() => setIsAccountCenterOpen(true)}')
    expect(source).toContain('const [isAccountCenterOpen, setIsAccountCenterOpen] = useState(false)')
  })

  it('keeps sign-out in the same dropdown', () => {
    expect(source).toContain('Sign out')
    expect(source).toContain('void signOut()')
  })

  it('does not render the old LayoutGrid account icon', () => {
    expect(source).not.toContain('<LayoutGrid')
  })

  // ── Structural tests: Avatar and Library share the same flex container ──

  it('Avatar is NOT independently fixed — no standalone fixed positioning on the trigger button', () => {
    // The old code had `fixed left-4 top-4` on the avatar button itself.
    // Now the button should have no `fixed` class; the wrapper div carries it.
    const triggerMatch = source.match(/aria-label="Open account menu"[\s\S]*?<\/button>/)
    expect(triggerMatch).not.toBeNull()
    expect(triggerMatch![0]).not.toContain('fixed')
    expect(triggerMatch![0]).not.toContain('left-4')
    expect(triggerMatch![0]).not.toContain('top-4')
  })

  it('Avatar and Library are inside the same flex container div', () => {
    // Find the flex container that holds the top-left control group. It is a
    // vertical rail: `fixed left-4 top-4 flex flex-col items-center gap-2.5`.
    const containerStart = source.indexOf(HEADER_CONTAINER)
    expect(containerStart, 'header container marker not found').toBeGreaterThan(-1)

    // Extract a generous slice of the file from that point to capture the container body.
    const slice = source.slice(containerStart, containerStart + 8000)

    // Both the Avatar DropdownMenu and the Library button must be inside this region.
    const avatarIdx = slice.indexOf('aria-label="Open account menu"')
    const libraryIdx = slice.indexOf('aria-label="Library"')

    expect(avatarIdx).toBeGreaterThan(-1)
    expect(libraryIdx).toBeGreaterThan(-1)
    // Library must come first, with Avatar immediately after it.
    expect(libraryIdx).toBeLessThan(avatarIdx)
  })

  it('the flex container wraps both Avatar dropdown and Library button (no separate fixed div for icons)', () => {
    // There should be exactly ONE `fixed left-4 top-4` occurrence in the file —
    // the combined container. The old separate icon-row div (`fixed left-14 top-4`)
    // must be gone.
    const fixedLeft4Count = (source.match(/fixed left-4 top-4/g) || []).length
    expect(fixedLeft4Count).toBe(1)

    const oldIconRowCount = (source.match(/fixed left-14 top-4/g) || []).length
    expect(oldIconRowCount).toBe(0)
  })

  it('Library is the first child and Avatar dropdown is the second child in the flex row', () => {
    // Extract the flex container content and verify child order.
    // Assert the marker was found before slicing on it: indexOf returns -1 when
    // the class list is reworded, and `slice(-1, 3999)` then returns the last
    // character of the file, so every assertion below would fail pointing at
    // child order rather than at the renamed marker that actually broke.
    const containerStart = source.indexOf(HEADER_CONTAINER)
    expect(containerStart, 'header container marker not found').toBeGreaterThan(-1)
    const containerSlice = source.slice(containerStart, containerStart + 8000)

    // First child: the TooltipProvider wrapping the Library button
    const tooltipProviderIdx = containerSlice.indexOf('<TooltipProvider')
    // Second child: the DropdownMenu wrapping the Avatar button
    const dropdownMenuIdx = containerSlice.indexOf('<DropdownMenu>')

    expect(dropdownMenuIdx).toBeGreaterThan(-1)
    expect(tooltipProviderIdx).toBeGreaterThan(-1)
    expect(tooltipProviderIdx).toBeLessThan(dropdownMenuIdx)
  })

  // Carried over from the superseded #219: the two controls the user reads as a
  // pair must actually be the same size. The rail stacks them vertically now,
  // so a mismatch is more visible than it was side by side, not less.
  it('renders Library and Profile with the same circular outer dimensions', () => {
    const headerStart = source.indexOf(HEADER_CONTAINER)
    expect(headerStart, 'header container marker not found').toBeGreaterThan(-1)
    const header = source.slice(headerStart, headerStart + 8000)

    const extractButton = (ariaLabel: string) => {
      const labelIndex = header.indexOf(`aria-label="${ariaLabel}"`)
      expect(labelIndex, `${ariaLabel} control not found`).toBeGreaterThan(-1)
      const buttonStart = header.lastIndexOf('<button', labelIndex)
      expect(buttonStart, `${ariaLabel} <button> opening tag not found`).toBeGreaterThan(-1)
      const buttonEnd = header.indexOf('</button>', labelIndex)
      expect(buttonEnd, `${ariaLabel} <button> closing tag not found`).toBeGreaterThan(-1)
      return header.slice(buttonStart, buttonEnd + '</button>'.length)
    }

    const libraryButton = extractButton('Library')
    const profileButton = extractButton('Open account menu')

    expect(libraryButton).toContain('h-10 w-10')
    expect(libraryButton).toContain('rounded-full')
    expect(profileButton).toContain('h-10 w-10')
    expect(profileButton).toContain('rounded-full')
  })
})
