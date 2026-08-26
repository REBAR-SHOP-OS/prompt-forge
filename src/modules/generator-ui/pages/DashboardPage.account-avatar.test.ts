import { describe, it, expect } from 'vitest'
// ?raw import is resolved by Vite at bundle/transform time — no node:fs, node:path,
// or __dirname needed at runtime. Works identically in jsdom and node environments.
import source from './DashboardPage.tsx?raw'

// Regression coverage for the top-left account control: the first header icon is
// now a circular avatar (initials fallback) that opens the same Account Center
// dialog via the existing isAccountCenterOpen state. The Library icon remains a
// separate, second control in the same row.
describe('DashboardPage account avatar header control', () => {
  it('renders a circular avatar as the first header control', () => {
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
})
