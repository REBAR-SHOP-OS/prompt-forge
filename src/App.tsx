import { HashRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/core/auth/AuthProvider'
import DashboardPage from './modules/generator-ui/pages/DashboardPage'
import LoginPage from './pages/auth/LoginPage'
import OAuthConsent from './pages/auth/OAuthConsent'
import LoadingScreen from '@/core/ui/LoadingScreen'
import RootErrorBoundary from '@/core/ui/RootErrorBoundary'
import LibrarySyncGate from '@/modules/generator-ui/components/LibrarySyncGate'

const isOAuthConsentPath = () =>
  typeof window !== 'undefined' &&
  window.location.pathname.replace(/\/+$/, '') === '/.lovable/oauth/consent'

function Gate() {
  const { session, loading } = useAuth()

  if (loading) return <LoadingScreen />
  return session ? (
    <LibrarySyncGate>
      <DashboardPage />
    </LibrarySyncGate>
  ) : (
    <LoginPage />
  )
}

function App() {
  return (
    <RootErrorBoundary>
      <HashRouter>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </HashRouter>
    </RootErrorBoundary>
  )
}

export default App
