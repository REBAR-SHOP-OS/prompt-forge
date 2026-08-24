import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AccountCenterDialog } from './AccountCenterDialog'

const mocks = vi.hoisted(() => ({
  // Stable references so useAuth() returns the same object identity across
  // renders (mirrors the memoized AuthProvider value) and does not retrigger
  // the useUsageStats load effect in an infinite loop.
  user: { id: 'user-1', email: 'radin@example.com', user_metadata: {} as Record<string, unknown> },
  profile: { id: 'user-1', email: 'radin@example.com', role: 'user' as const, credits_balance: 500, created_at: '' },
  email: 'radin@example.com',
  fullName: null as string | null,
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
}))

vi.mock('@/core/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, profile: mocks.profile }),
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
  mocks.email = 'radin@example.com'
  mocks.fullName = null
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
})

describe('AccountCenterDialog', () => {
  it('opens and shows the caller email', async () => {
    renderDialog()
    expect(await screen.findByText('Account Center')).toBeInTheDocument()
    expect(await screen.findByText('radin@example.com')).toBeInTheDocument()
  })

  it('shows display name when present', async () => {
    mocks.user.user_metadata = { full_name: 'Radin Rebar' }
    renderDialog()
    expect(await screen.findByText('Radin Rebar')).toBeInTheDocument()
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
