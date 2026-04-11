import { useState } from 'react'

// ─── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

// ─── Score badge ──────────────────────────────────────────────────────────────
export function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return <span className="text-slate-500 mono text-sm">—</span>
  const cls = score >= 70 ? 'score-high' : score >= 45 ? 'score-mid' : 'score-low'
  return (
    <span className={`mono text-xs font-medium px-2 py-0.5 rounded ${cls}`}>
      {score}
    </span>
  )
}

// ─── Status pill ──────────────────────────────────────────────────────────────
export function StatusPill({ status }: { status: string }) {
  const label: Record<string, string> = {
    accepted: 'Accepted', rejected: 'Rejected', reviewing: 'Review',
    duplicate: 'Duplicate', enriching: 'Enriching', scoring: 'Scoring',
    ingested: 'Queued', active: 'Active', paused: 'Paused',
    complete: 'Complete', draft: 'Draft', cancelled: 'Cancelled',
    sent: 'Sent', paid: 'Paid', overdue: 'Overdue',
  }
  return (
    <span className={`status-${status} text-xs font-medium px-2 py-0.5 rounded-full capitalize`}>
      {label[status] ?? status}
    </span>
  )
}

// ─── Tier badge ───────────────────────────────────────────────────────────────
export function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    mql:       'bg-blue-900/30 text-blue-400 border border-blue-800/40',
    custom_q:  'bg-purple-900/30 text-purple-400 border border-purple-800/40',
    bant:      'bg-teal-900/30 text-teal-400 border border-teal-800/40',
    bant_appt: 'bg-green-900/30 text-green-400 border border-green-800/40',
  }
  const labels: Record<string, string> = {
    mql: 'MQL', custom_q: 'Custom Q', bant: 'BANT', bant_appt: 'BANT+Appt',
  }
  return (
    <span className={`text-xs font-medium mono px-2 py-0.5 rounded ${styles[tier] ?? 'bg-slate-800 text-slate-400'}`}>
      {labels[tier] ?? tier}
    </span>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ delivered, ordered, className = '' }: {
  delivered: number; ordered: number; className?: string
}) {
  const pct = ordered > 0 ? Math.min(100, Math.round((delivered / ordered) * 100)) : 0
  const color = pct >= 80 ? '#22A05A' : pct >= 40 ? '#2E5FA3' : '#4A7FC1'
  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between text-xs text-slate-400 mono mb-1">
        <span>{delivered.toLocaleString()} / {ordered.toLocaleString()}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ─── Metric card ──────────────────────────────────────────────────────────────
export function MetricCard({ label, value, sub, accent = false }: {
  label: string; value: string | number; sub?: string; accent?: boolean
}) {
  return (
    <div className={`card p-5 fade-up ${accent ? 'border-boss/40' : ''}`}>
      <p className="text-slate-400 text-xs uppercase tracking-widest mb-2">{label}</p>
      <p className="mono text-2xl font-medium text-slate-100">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ message, cta, onCta }: {
  message: string; cta?: string; onCta?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-4">
        <span className="text-2xl">◎</span>
      </div>
      <p className="text-slate-400 text-sm">{message}</p>
      {cta && onCta && (
        <button onClick={onCta} className="mt-4 text-boss-light text-sm hover:text-white transition-colors">
          {cta} →
        </button>
      )}
    </div>
  )
}

// ─── Modal / slide-over ───────────────────────────────────────────────────────
export function SlideOver({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-navy-50 border-l border-white/08 h-full overflow-y-auto flex flex-col z-10"
        style={{ background: '#1A2B3C' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/08">
          <h2 className="font-medium text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────
export function Table<T extends Record<string, unknown>>({
  columns, data, loading, onRowClick, emptyMessage = 'No data',
}: {
  columns: { key: string; label: string; render?: (row: T) => React.ReactNode; mono?: boolean }[]
  data: T[]
  loading?: boolean
  onRowClick?: (row: T) => void
  emptyMessage?: string
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }
  if (!data.length) return <EmptyState message={emptyMessage} />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/06">
            {columns.map(col => (
              <th key={col.key} className="text-left text-slate-500 text-xs uppercase tracking-wider px-4 py-3 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-white/04 hover:bg-white/03 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map(col => (
                <td key={col.key} className={`px-4 py-3 text-slate-200 ${col.mono ? 'mono' : ''}`}>
                  {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
export function Nav({ current, onChange }: {
  current: string
  onChange: (page: string) => void
}) {
  const links = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'reports',   label: 'Reports'   },
    { id: 'settings',  label: 'Settings'  },
  ]
  return (
    <nav className="flex items-center gap-1 px-6 py-3 border-b border-white/06 bg-navy-100"
      style={{ background: '#0F1923' }}>
      <div className="flex items-center gap-3 mr-8">
        <div className="w-6 h-6 rounded bg-boss flex items-center justify-center">
          <span className="text-white text-xs font-bold mono">B</span>
        </div>
        <span className="text-slate-300 text-sm font-medium">BOSS Portal</span>
      </div>
      {links.map(l => (
        <button
          key={l.id}
          onClick={() => onChange(l.id)}
          className={`px-4 py-1.5 rounded text-sm transition-colors ${
            current === l.id
              ? 'bg-boss/20 text-boss-light font-medium'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {l.label}
        </button>
      ))}
    </nav>
  )
}

// ─── useAsync hook ────────────────────────────────────────────────────────────
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true); setError(null)
    try { setData(await fn()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => { run() }, deps)

  return { data, loading, error, refetch: run }
}
