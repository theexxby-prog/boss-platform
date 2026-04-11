import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import '../src/index.css'
import { TenantsPage, OpsKpiPage, FinancialsPage, DomainHealthPage } from './pages/index'

const NAV = [
  { id: 'tenants',   label: 'Tenants'       },
  { id: 'ops',       label: 'Ops KPI'       },
  { id: 'financials',label: 'Financials'    },
  { id: 'domains',   label: 'Domain health' },
]

function App() {
  const token = localStorage.getItem('boss_admin_token')
  const [page, setPage] = useState('tenants')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(Boolean(token))
  const [err, setErr] = useState('')

  const login = async () => {
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error('Invalid credentials')
      const { data } = await res.json()
      localStorage.setItem('boss_admin_token', data.token)
      setAuthed(true)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error') }
  }

  if (!authed) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0F1923' }}>
      <div className="card p-6 w-full max-w-sm fade-up">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-7 h-7 rounded bg-red-700 flex items-center justify-center">
            <span className="text-white text-xs mono font-bold">A</span>
          </div>
          <span className="text-slate-200 font-medium">BOSS Admin</span>
        </div>
        <input type="email" placeholder="Admin email" value={email} onChange={e => setEmail(e.target.value)}
          className="w-full bg-slate-800 border border-white/08 rounded px-3 py-2 text-sm text-slate-200 mb-3 focus:outline-none focus:border-red-700/60" />
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          className="w-full bg-slate-800 border border-white/08 rounded px-3 py-2 text-sm text-slate-200 mb-4 focus:outline-none focus:border-red-700/60" />
        {err && <p className="text-red-400 text-xs mb-3">{err}</p>}
        <button onClick={login} className="w-full bg-red-800 hover:bg-red-700 text-white rounded py-2 text-sm font-medium transition-colors">
          Sign in
        </button>
      </div>
    </div>
  )

  const pages: Record<string, React.ReactNode> = {
    tenants:    <TenantsPage />,
    ops:        <OpsKpiPage />,
    financials: <FinancialsPage />,
    domains:    <DomainHealthPage />,
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="flex items-center gap-1 px-6 py-3 border-b border-white/06" style={{ background: '#0F1923' }}>
        <div className="flex items-center gap-2 mr-8">
          <div className="w-6 h-6 rounded bg-red-800 flex items-center justify-center">
            <span className="text-white text-xs mono font-bold">A</span>
          </div>
          <span className="text-slate-300 text-sm font-medium">BOSS Admin</span>
        </div>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)}
            className={`px-4 py-1.5 rounded text-sm transition-colors ${
              page === n.id ? 'bg-red-900/30 text-red-400 font-medium' : 'text-slate-400 hover:text-slate-200'
            }`}>
            {n.label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => { localStorage.removeItem('boss_admin_token'); setAuthed(false) }}
          className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
          Sign out
        </button>
      </nav>
      <main className="flex-1 overflow-auto">{pages[page]}</main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
