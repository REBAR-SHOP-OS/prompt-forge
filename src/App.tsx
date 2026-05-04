import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/core/auth/AuthProvider'
import DashboardPage from './modules/generator-ui/pages/DashboardPage'
import LoginPage from './pages/auth/LoginPage'
import LoadingScreen from '@/core/ui/LoadingScreen'

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return session ? <DashboardPage /> : <LoginPage />
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
