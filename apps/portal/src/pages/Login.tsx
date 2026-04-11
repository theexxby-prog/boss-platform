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
    } finally { setLoading(false) }
  }

  const inputStyle = {
    width: '100%', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)',
    outline: 'none', transition: 'border-color 0.15s',
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--main-bg)' }}>
      {/* Subtle gradient bg */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(46,95,163,0.08) 0%, transparent 70%)' }} />

      <div className="w-full max-w-sm fade-up relative">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--primary-mid)', boxShadow: '0 8px 24px rgba(46,95,163,0.35)' }}>
            <span className="text-white font-bold mono text-xl">B</span>
          </div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>BOSS Portal</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Sign in to your account</p>
        </div>

        <div className="glass-strong p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Email address
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="you@company.com" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--primary-mid)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Password
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder="••••••••" style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'var(--primary-mid)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            </div>

            {error && (
              <div className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                {error}
              </div>
            )}

            <button onClick={submit} disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: loading ? 'rgba(46,95,163,0.5)' : 'var(--primary-mid)',
                boxShadow: loading ? 'none' : '0 4px 12px rgba(46,95,163,0.3)' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
          Business Optimization & Syndication Services
        </p>
      </div>
    </div>
  )
}
