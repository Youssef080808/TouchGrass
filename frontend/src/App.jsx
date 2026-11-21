import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import TabBar from './components/TabBar'
import { Button, Spinner } from './components/ui'
import HangPage from './pages/HangPage'
import Home from './pages/Home'
import JoinPage from './pages/JoinPage'
import Leaderboard from './pages/Leaderboard'
import MapPage from './pages/MapPage'
import Onboarding, { PENDING_JOIN_KEY } from './pages/Onboarding'
import Profile from './pages/Profile'
import { useUser } from './user'

// Someone scanned a QR code before signing up: remember the code, join right after onboarding.
function RememberJoin() {
  const { code } = useParams()
  useEffect(() => {
    sessionStorage.setItem(PENDING_JOIN_KEY, code)
  }, [code])
  return <Onboarding />
}

function Shell({ children }) {
  // The app is phone-sized; on a laptop it sits in a centred phone-width column.
  return <div className="relative mx-auto min-h-dvh w-full max-w-[440px] bg-canvas shadow-2xl">{children}</div>
}

export default function App() {
  const { user, loading, offline, refresh } = useUser()
  const location = useLocation()

  if (loading) {
    return (
      <Shell>
        <Spinner />
      </Shell>
    )
  }

  if (offline) {
    return (
      <Shell>
        <div className="flex min-h-dvh flex-col justify-center gap-4 px-6 text-center">
          <p className="text-lg font-semibold">Can't reach the server</p>
          <p className="text-muted">Check your connection, or make sure the backend is running.</p>
          <Button onClick={refresh}>Try again</Button>
        </div>
      </Shell>
    )
  }

  if (!user) {
    return (
      <Shell>
        <Routes>
          <Route path="/join/:code" element={<RememberJoin />} />
          <Route path="*" element={<Onboarding />} />
        </Routes>
      </Shell>
    )
  }

  const pushed = location.pathname.startsWith('/hang/') || location.pathname.startsWith('/join/')

  return (
    <Shell>
      {/* Keyed by path so each screen animates in like a native app: tabs fade up, a Hang slides in. */}
      <div key={location.pathname} className={`overflow-x-clip ${pushed ? 'motion-safe:animate-push' : 'motion-safe:animate-page'}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/ranks" element={<Leaderboard />} />
          <Route path="/me" element={<Profile />} />
          <Route path="/hang/:id" element={<HangPage />} />
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!pushed && <TabBar />}
    </Shell>
  )
}
