import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import './index.css'
import { Nav } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('boss_token'))
  const [page, setPage] = useState('dashboard')
  const [pageParam, setPageParam] = useState<string | undefined>()

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash) setPage(hash.split('/')[0])
  }, [])

  const navigate = (p: string, id?: string) => {
    setPage(p)
    setPageParam(id)
    window.location.hash = id ? `${p}/${id}` : p
  }

  if (!token) return <Login onLogin={setToken} />

  const pages: Record<string, React.ReactNode> = {
    dashboard: <Dashboard onNavigate={navigate} />,
    campaigns: <Campaigns initialId={pageParam} />,
    reports:   <Reports />,
    settings:  <Settings />,
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Nav current={page} onChange={p => navigate(p)} />
      <main className="flex-1 overflow-auto">
        {pages[page] ?? pages.dashboard}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
