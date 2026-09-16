import LibrarySyncGate from './components/LibrarySyncGate'
import DashboardPage from './pages/DashboardPage'

export default function AuthenticatedStudio() {
  return (
    <LibrarySyncGate>
      <DashboardPage />
    </LibrarySyncGate>
  )
}
