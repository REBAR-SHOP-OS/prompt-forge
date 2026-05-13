import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/core/auth/AuthProvider'
import DashboardPage from './modules/generator-ui/pages/DashboardPage'
import LoginPage from './pages/auth/LoginPage'
import LoadingScreen from '@/core/ui/LoadingScreen'
import RootErrorBoundary from '@/core/ui/RootErrorBoundary'

function Gate() {
  const { session, loading } = useAuth()

  if (loading) return <LoadingScreen />
  return session ? <DashboardPage /> : <LoginPage />
}

function App() {
  return (
    <RootErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  )
}

export default App
