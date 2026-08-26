import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AccountCenterDialog } from './AccountCenterDialog'

const mocks = vi.hoisted(() => ({
  // Stable references so useAuth() returns the same object identity across
  // renders (mirrors the memoized AuthProvider value) and does not retrigger
  // the useUsageStats load effect in an infinite loop.
  user: { id: 'user-1', email: 'radin@example.com', user_metadata: {} as Record<string, unknown> },
  profile: { id: 'user-1', email: 'radin@example.com', role: 'user' as const, credits_balance: 500, created_at: '' },
  // usage stats
  creditsBalance: 500,
  dailyLimit: 1500,
  monthlyLimit: 30000,
  usedToday: 200,
  usedMonth: 5000,
  lifetimeSpend: 12000,
  lifetimeSpendCount: 40,
  completedJobs: 12,
  // query builders
  maybeSingle: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  lt: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  // profile edit
  firstName: '',
  lastName: '',
  avatarUrl: null as string | null,
  saveStatus: 'idle' as 'idle' | 'saving' | 'success' | 'error',
  saveError: null as string | null,
  uploading: false,
  setFirstName: vi.fn(),
  setLastName: vi.fn(),
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  saveProfile: vi.fn(),
  resetStatus: vi.fn(),
}))

vi.mock('@/core/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, profile: mocks.profile, refreshProfile: vi.fn() }),
}))

vi.mock('@/modules/generator-ui/hooks/useProfileEdit', () => ({
  useProfileEdit: () => ({
    firstName: mocks.firstName,
    lastName: mocks.lastName,
    avatarUrl: mocks.avatarUrl,
    saveStatus: mocks.saveStatus,
    saveError: mocks.saveError,
    uploading: mocks.uploading,
    setFirstName: mocks.setFirstName,
    setLastName: mocks.setLastName,
    uploadAvatar: mocks.uploadAvatar,
    removeAvatar: mocks.removeAvatar,
    saveProfile: mocks.saveProfile,
    resetStatus: mocks.resetStatus,
  }),
}))

// Build a chainable Supabase query mock.
function chain(final: unknown) {
  const b = {
    maybeSingle: vi.fn().mockResolvedValue(final),
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
  }
  b.select.mockReturnValue(b)
  b.eq.mockReturnValue(b)
  b.gte.mockReturnValue(b)
  b.lt.mockReturnValue(b)
  return b
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'core_user_profiles') return chain({ data: { credits_balance: mocks.creditsBalance }, error: null })
      if (table === 'billing_user_quotas') return chain({ data: { daily_limit_credits: mocks.dailyLimit, monthly_limit_credits: mocks.monthlyLimit, used_today: mocks.usedToday, used_this_month: mocks.usedMonth, last_reset_day: null }, error: null })
      if (table === 'billing_credit_transactions') return chain({ data: [], error: null })
      if (table === 'generator_generation_jobs') return chain({ data: [], error: null, count: mocks.completedJobs })
      return chain({ data: [], error: null })
    },
    channel: () => ({
      on: () => ({ on: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }) }),
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  },
}))

function renderDialog(open = true) {
  const onOpenChange = vi.fn()
  const utils = render(<AccountCenterDialog open={open} onOpenChange={onOpenChange} />)
  return { onOpenChange, ...utils }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.email = 'radin@example.com'
  mocks.user.user_metadata = {}
  mocks.profile.email = 'radin@example.com'
  mocks.profile.credits_balance = 500
  mocks.creditsBalance = 500
  mocks.usedToday = 200
  mocks.usedMonth = 5000
  mocks.lifetimeSpend = 12000
  mocks.lifetimeSpendCount = 40
  mocks.completedJobs = 12
  mocks.firstName = ''
  mocks.lastName = ''
  mocks.avatarUrl = null
  mocks.saveStatus = 'idle'
  mocks.saveError = null
  mocks.uploading = false
})

describe('AccountCenterDialog', () => {
  it('opens and shows the caller email', async () => {
    renderDialog()
    expect(await screen.findByText('Account Center')).toBeInTheDocument()
    expect(await screen.findByText('radin@example.com')).toBeInTheDocument()
  })

  it('shows first and last name input fields', async () => {
    mocks.firstName = 'Radin'
    mocks.lastName = 'Rebar'
    renderDialog()
    expect(await screen.findByDisplayValue('Radin')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Rebar')).toBeInTheDocument()
  })

  it('renders a circular avatar in the dialog title with initials fallback', async () => {
    mocks.firstName = 'Radin'
    mocks.lastName = 'Rebar'
    renderDialog()
    // Title avatar shows initials from first/last name (also mirrored in the
    // large profile avatar, so assert at least one instance is present).
    expect((await screen.findAllByText('RR')).length).toBeGreaterThan(0)
  })

  it('falls back to email initials in the title avatar when name is empty', async () => {
    mocks.firstName = ''
    mocks.lastName = ''
    mocks.profile.email = 'radin.rebar@example.com'
    renderDialog()
    expect((await screen.findAllByText('RR')).length).toBeGreaterThan(0)
  })

  it('shows email as read-only text, not an input', async () => {
    renderDialog()
    expect(await screen.findByText('radin@example.com')).toBeInTheDocument()
    // Email should not be in an editable input
    expect(screen.queryByRole('textbox', { name: /email/i })).not.toBeInTheDocument()
  })

  it('shows avatar upload button when no avatar is set', async () => {
    renderDialog()
    expect(await screen.findByText('Upload')).toBeInTheDocument()
    expect(screen.queryByText('Replace')).not.toBeInTheDocument()
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('shows Replace and Remove buttons when avatar is set', async () => {
    mocks.avatarUrl = 'https://example.com/avatar.png'
    renderDialog()
    expect(await screen.findByText('Replace')).toBeInTheDocument()
    expect(await screen.findByText('Remove')).toBeInTheDocument()
  })

  it('shows Save profile button', async () => {
    renderDialog()
    expect(await screen.findByText('Save profile')).toBeInTheDocument()
  })

  it('shows Saved status after successful save', async () => {
    mocks.saveStatus = 'success'
    renderDialog()
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('shows saving indicator', async () => {
    mocks.saveStatus = 'saving'
    renderDialog()
    expect(await screen.findByText('Saving…')).toBeInTheDocument()
  })

  it('shows save error when present', async () => {
    mocks.saveError = 'Failed to save profile.'
    renderDialog()
    expect(await screen.findByText('Failed to save profile.')).toBeInTheDocument()
  })

  it('calls saveProfile when Save button is clicked', async () => {
    renderDialog()
    const saveBtn = await screen.findByText('Save profile')
    fireEvent.click(saveBtn)
    expect(mocks.saveProfile).toHaveBeenCalled()
  })

  it('calls setFirstName when first name input changes', async () => {
    renderDialog()
    await screen.findByText('Account Center')
    const firstInput = screen.getByLabelText('First name')
    fireEvent.change(firstInput, { target: { value: 'NewName' } })
    expect(mocks.setFirstName).toHaveBeenCalledWith('NewName')
  })

  it('shows usage figures from the shared hook', async () => {
    renderDialog()
    expect(await screen.findByText('Available credits')).toBeInTheDocument()
    expect(await screen.findByText('Completed videos')).toBeInTheDocument()
    expect(await screen.findByText('Lifetime credits spent')).toBeInTheDocument()
    expect(await screen.findByText('Average cost')).toBeInTheDocument()
    expect(await screen.findByText('Remaining generations')).toBeInTheDocument()
    expect(await screen.findByText('Activity')).toBeInTheDocument()
  })

  it('shows a low-credit warning when balance is low', async () => {
    mocks.creditsBalance = 50
    renderDialog()
    expect(await screen.findByText(/credit balance is low/i)).toBeInTheDocument()
  })

  it('does not show low-credit warning when balance is healthy', async () => {
    mocks.creditsBalance = 500
    renderDialog()
    await screen.findByText('Account Center')
    expect(screen.queryByText(/credit balance is low/i)).not.toBeInTheDocument()
  })

  it('calls onOpenChange(false) when closed', async () => {
    const { onOpenChange } = renderDialog()
    await screen.findByText('Account Center')
    const close = screen.getByRole('button', { name: 'Close' })
    fireEvent.click(close)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})