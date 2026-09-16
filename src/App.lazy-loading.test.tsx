import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  current: { session: null as unknown, loading: false },
}))

const studioState = vi.hoisted(() => ({ moduleEvaluations: 0 }))

vi.mock('@/core/auth/AuthProvider', () => ({
  useAuth: () => authState.current,
}))

vi.mock('./pages/auth/LoginPage', () => ({
  default: () => <div data-testid="login-page">Login</div>,
}))

vi.mock('./pages/auth/OAuthConsent', () => ({
  default: () => <div data-testid="oauth-consent">OAuth consent</div>,
}))

vi.mock('@/core/ui/LoadingScreen', () => ({
  default: () => <div data-testid="loading-screen">Loading</div>,
}))

vi.mock('./modules/generator-ui/AuthenticatedStudio', () => {
  studioState.moduleEvaluations += 1
  return {
    default: () => <div data-testid="authenticated-studio">Studio</div>,
  }
})

import { Gate } from './App'

beforeEach(() => {
  authState.current = { session: null, loading: false }
  window.history.replaceState({}, '', '/')
})

describe('App authentication bundle boundary', () => {
  it('does not evaluate the Studio module for loading or unauthenticated states', () => {
    authState.current = { session: null, loading: true }
    const view = render(<Gate />)

    expect(screen.getByTestId('loading-screen')).toBeInTheDocument()
    expect(studioState.moduleEvaluations).toBe(0)

    authState.current = { session: null, loading: false }
    view.rerender(<Gate />)

    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    expect(studioState.moduleEvaluations).toBe(0)
  })

  it('loads the Studio module only after an authenticated session renders', async () => {
    authState.current = { session: { access_token: 'test-session' }, loading: false }
    render(<Gate />)

    expect(await screen.findByTestId('authenticated-studio')).toBeInTheDocument()
    expect(studioState.moduleEvaluations).toBe(1)
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
  })

  it('keeps Dashboard and library synchronization behind the dynamic Studio boundary', () => {
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
    const studioSource = readFileSync(
      resolve(process.cwd(), 'src/modules/generator-ui/AuthenticatedStudio.tsx'),
      'utf8',
    )
    const hasEagerStudioImport = (source: string) =>
      /import\s+[^'"\n]*(?:DashboardPage|LibrarySyncGate)[^'"\n]*from\s+['"]/.test(source)

    expect(hasEagerStudioImport("import DashboardPage from './DashboardPage'")).toBe(true)
    expect(hasEagerStudioImport(appSource)).toBe(false)
    expect(appSource).toContain(
      "lazy(() => import('./modules/generator-ui/AuthenticatedStudio'))",
    )
    expect(studioSource).toContain("import DashboardPage from './pages/DashboardPage'")
    expect(studioSource).toContain("import LibrarySyncGate from './components/LibrarySyncGate'")
  })
})
