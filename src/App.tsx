import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/core/auth/AuthProvider'
import DashboardPage from './modules/generator-ui/pages/DashboardPage'
import LoginPage from './pages/auth/LoginPage'
import LoadingScreen from '@/core/ui/LoadingScreen'
import LoginIntro from '@/components/intro/LoginIntro'

function Gate() {
  const { session, loading } = useAuth()
  const [showIntro, setShowIntro] = useState(false)

  useEffect(() => {
    if (!session) return
    try {
      if (sessionStorage.getItem('intro_played') !== '1') {
        setShowIntro(true)
      }
    } catch {
      setShowIntro(true)
    }
  }, [session])

  if (loading) return <LoadingScreen />
  if (session && showIntro) {
    return (
      <LoginIntro
        onFinish={() => {
          try { sessionStorage.setItem('intro_played', '1') } catch { /* ignore */ }
          setShowIntro(false)
        }}
      />
    )
  }
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
