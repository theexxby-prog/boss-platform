import { useState } from 'react'
import { EmptyState } from '../components/ui'

function WeightSlider({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-slate-400 text-sm w-32">{label}</span>
      <input
        type="range" min={0} max={60} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-boss"
      />
      <span className="mono text-slate-200 text-sm w-8 text-right">{value}</span>
    </div>
  )
}

export default function Settings() {
  const [weights, setWeights] = useState({
    industry: 25, seniority: 25, company_size: 20, geography: 15, tech: 15,
  })
  const [apiKeys] = useState([
    { id: '1', name: 'Production key', prefix: 'sk-boss-Ab12Cd34', created_at: Date.now() - 7 * 86400000 },
  ])
  const [saved, setSaved] = useState(false)

  const total = Object.values(weights).reduce((s, v) => s + v, 0)
  const valid = total === 100

  const setWeight = (key: keyof typeof weights) => (v: number) => {
    setWeights(w => ({ ...w, [key]: v }))
  }

  const saveWeights = () => {
    if (!valid) return
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fade-up">
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-lg font-medium text-slate-100">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">ICP profile, API keys, and preferences</p>
      </div>

      <div className="px-6 space-y-5 pb-8">
        {/* ICP Weights */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-slate-300">ICP scoring weights</h2>
            <span className={`mono text-xs px-2 py-0.5 rounded ${valid ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'}`}>
              Total: {total}/100
            </span>
          </div>
          <div className="space-y-4 mb-5">
            {(Object.entries(weights) as [keyof typeof weights, number][]).map(([k, v]) => (
              <WeightSlider key={k} label={k.replace('_', ' ')} value={v} onChange={setWeight(k)} />
            ))}
          </div>
          {!valid && (
            <p className="text-red-400 text-xs mb-3">Weights must sum to exactly 100</p>
          )}
          <button
            onClick={saveWeights}
            disabled={!valid}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              valid
                ? 'bg-boss hover:bg-boss-light text-white'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            {saved ? '✓ Saved' : 'Save weights'}
          </button>
        </div>

        {/* API Keys */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-slate-300">API keys</h2>
            <button className="text-xs text-boss-light hover:text-white transition-colors">
              + Generate new key
            </button>
          </div>
          {apiKeys.length ? (
            <div className="space-y-2">
              {apiKeys.map(k => (
                <div key={k.id} className="flex items-center justify-between px-3 py-2 rounded bg-slate-800/50 border border-white/06">
                  <div>
                    <p className="text-slate-200 text-sm">{k.name}</p>
                    <p className="mono text-slate-500 text-xs mt-0.5">{k.prefix}••••••••</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500 text-xs">
                      Created {new Date(k.created_at).toLocaleDateString()}
                    </span>
                    <button className="text-red-400 hover:text-red-300 text-xs transition-colors">Revoke</button>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No API keys" />}
        </div>

        {/* Notifications */}
        <div className="card p-5">
          <h2 className="text-sm font-medium text-slate-300 mb-4">Notification preferences</h2>
          <div className="space-y-3">
            {[
              { label: 'Delivery batch ready', description: 'When a new lead batch is available for download' },
              { label: 'Campaign at 80% delivery', description: 'Renewal alert — contact your account manager' },
              { label: 'Invoice sent', description: 'When a new invoice is generated' },
            ].map(({ label, description }) => (
              <div key={label} className="flex items-center justify-between">
                <div>
                  <p className="text-slate-200 text-sm">{label}</p>
                  <p className="text-slate-500 text-xs">{description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:bg-boss transition-colors" />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
