import { useState } from 'react'
import { api } from '../lib/api'

export default function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!email || !password) return
    setLoading(true); setError('')
    try {
      const { token } = await api.login(email, password)
      localStorage.setItem('boss_token', token)
      onLogin(token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0F1923' }}>
      <div className="w-full max-w-sm fade-up">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10 justify-center">
          <div className="w-8 h-8 rounded-lg bg-boss flex items-center justify-center">
            <span className="text-white font-bold mono">B</span>
          </div>
          <span className="text-slate-100 font-medium text-lg tracking-tight">BOSS Portal</span>
        </div>

        <div className="card p-6">
          <h1 className="text-slate-100 font-medium mb-1">Sign in</h1>
          <p className="text-slate-500 text-sm mb-6">Access your campaign dashboard</p>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="you@company.com"
                className="w-full bg-slate-800 border border-white/08 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-boss/60 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="••••••••"
                className="w-full bg-slate-800 border border-white/08 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-boss/60 transition-colors"
              />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              onClick={submit} disabled={loading}
              className="w-full bg-boss hover:bg-boss-light disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          BOSS — Business Optimization & Syndication Services
        </p>
      </div>
    </div>
  )
}
