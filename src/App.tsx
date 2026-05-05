import { lazy, Suspense } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, useOptionalAuth } from '@/core/auth/AuthProvider'
import LoginPage from './pages/auth/LoginPage'
import LoadingScreen from '@/core/ui/LoadingScreen'

const DashboardPage = lazy(() => import('./modules/generator-ui/pages/DashboardPage'))

function Gate() {
  const auth = useOptionalAuth()
  if (!auth) return <LoadingScreen />
  const { session, loading } = auth
  if (loading) return <LoadingScreen />
  if (!session) return <LoginPage />
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DashboardPage />
    </Suspense>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
