import { AuthProvider } from '@/core/auth/AuthProvider'
import DashboardPage from './modules/generator-ui/pages/DashboardPage'

function App() {
  return (
    <AuthProvider>
      <DashboardPage />
    </AuthProvider>
  )
}

export default App
