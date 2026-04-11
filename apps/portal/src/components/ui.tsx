import { useState, useEffect } from 'react'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

export function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return <span className="mono text-sm" style={{ color: 'var(--text-muted)' }}>—</span>
  const cls = score >= 70 ? 'score-high' : score >= 45 ? 'score-mid' : 'score-low'
  const bg  = score >= 70 ? 'rgba(5,150,105,.1)' : score >= 45 ? 'rgba(46,95,163,.1)' : 'rgba(220,38,38,.1)'
  return (
    <span className={`mono text-xs font-medium px-2 py-0.5 rounded-full ${cls}`} style={{ background: bg }}>
      {score}
    </span>
  )
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  accepted:  { label: 'Accepted',  cls: 'pill-active'   },
  active:    { label: 'Active',    cls: 'pill-active'   },
  paid:      { label: 'Paid',      cls: 'pill-paid'     },
  rejected:  { label: 'Rejected',  cls: 'pill-rejected' },
  reviewing: { label: 'Review',    cls: 'pill-review'   },
  paused:    { label: 'Paused',    cls: 'pill-paused'   },
  duplicate: { label: 'Duplicate', cls: 'pill-complete' },
  enriching: { label: 'Enriching', cls: 'pill-sent'     },
  scoring:   { label: 'Scoring',   cls: 'pill-sent'     },
  ingested:  { label: 'Queued',    cls: 'pill-sent'     },
  complete:  { label: 'Complete',  cls: 'pill-complete' },
  draft:     { label: 'Draft',     cls: 'pill-draft'    },
  sent:      { label: 'Sent',      cls: 'pill-sent'     },
  cancelled: { label: 'Cancelled', cls: 'pill-complete' },
}

export function StatusPill({ status }: { status: string }) {
  const { label, cls } = STATUS_MAP[status] ?? { label: status, cls: 'pill-draft' }
  return <span className={`pill ${cls}`}>{label}</span>
}

const TIER_MAP: Record<string, { label: string; cls: string }> = {
  mql:       { label: 'MQL',       cls: 'tier-mql'       },
  custom_q:  { label: 'Custom Q',  cls: 'tier-custom_q'  },
  bant:      { label: 'BANT',      cls: 'tier-bant'      },
  bant_appt: { label: 'BANT+Appt', cls: 'tier-bant_appt' },
}

export function TierBadge({ tier }: { tier: string }) {
  const { label, cls } = TIER_MAP[tier] ?? { label: tier, cls: 'tier-mql' }
  return <span className={`pill mono text-xs ${cls}`} style={{ borderRadius: 6 }}>{label}</span>
}

export function ProgressBar({ delivered, ordered, className = '' }: {
  delivered: number; ordered: number; className?: string
}) {
  const pct = ordered > 0 ? Math.min(100, Math.round((delivered / ordered) * 100)) : 0
  const color = pct >= 80 ? 'var(--success)' : pct >= 40 ? 'var(--primary-mid)' : 'var(--primary-light)'
  return (
    <div className={className}>
      <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        <span className="mono">{delivered.toLocaleString()} / {ordered.toLocaleString()} leads</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export function MetricCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: boolean
}) {
  return (
    <div className="glass-strong p-5 fade-up"
      style={accent ? { boxShadow: 'var(--glass-shadow-blue)', borderColor: 'rgba(46,95,163,0.25)' } : {}}>
      <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="mono text-2xl font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

export function EmptyState({ message, cta, onCta }: {
  message: string; cta?: string; onCta?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'rgba(0,0,0,0.05)' }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="7.5" stroke="var(--text-muted)" strokeWidth="1.2"/>
          <path d="M10 7v3M10 13h.01" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
      {cta && onCta && (
        <button onClick={onCta} className="mt-4 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: 'var(--primary-mid)' }}>
          {cta} →
        </button>
      )}
    </div>
  )
}

export function SlideOver({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0" style={{ background: 'rgba(15,25,35,0.25)', backdropFilter: 'blur(4px)' }}
        onClick={onClose} />
      <div className="relative w-full max-w-lg h-full overflow-y-auto flex flex-col z-10"
        style={{ background: 'var(--glass-bg-strong)', backdropFilter: 'blur(24px)',
          borderLeft: '1px solid var(--glass-border)', boxShadow: '-8px 0 48px rgba(0,0,0,0.1)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>✕</button>
        </div>
        <div className="flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

export function Table<T extends Record<string, unknown>>({
  columns, data, loading, onRowClick, emptyMessage = 'No data',
}: {
  columns: { key: string; label: string; render?: (row: T) => React.ReactNode; mono?: boolean }[]
  data: T[]; loading?: boolean; onRowClick?: (row: T) => void; emptyMessage?: string
}) {
  if (loading) return (
    <div className="p-5 space-y-2.5">
      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
    </div>
  )
  if (!data.length) return <EmptyState message={emptyMessage} />
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {columns.map(col => (
              <th key={col.key} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} onClick={() => onRowClick?.(row)}
              className={`transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              style={{ borderBottom: '1px solid var(--border-light)' }}
              onMouseEnter={e => onRowClick && (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {columns.map(col => (
                <td key={col.key} className={`px-5 py-3.5 text-sm ${col.mono ? 'mono' : ''}`}
                  style={{ color: 'var(--text-primary)' }}>
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

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export function Sidebar({ current, onChange }: { current: string; onChange: (id: string) => void }) {
  const [pinned, setPinned] = useState(() => localStorage.getItem('boss-sidebar-pinned') !== 'false')
  const [hovered, setHovered] = useState(false)
  const expanded = pinned || hovered

  useEffect(() => { localStorage.setItem('boss-sidebar-pinned', String(pinned)) }, [pinned])

  const Icon = ({ d, active }: { d: string; active: boolean }) => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d={d} stroke={active ? 'var(--primary-mid)' : 'var(--text-muted)'}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

  const navItems = [
    { id: 'dashboard', label: 'Dashboard',
      d: 'M2 2h6v6H2zM10 2h6v6h-6zM2 10h6v6H2zM10 10h6v6h-6z' },
    { id: 'campaigns', label: 'Campaigns',
      d: 'M2 4.5h14M2 9h9M2 13.5h11' },
    { id: 'reports',   label: 'Reports',
      d: 'M3 14V8M7 14V5M11 14V9M15 14V2' },
    { id: 'settings',  label: 'Settings',
      d: 'M9 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM9 1v1.5M9 15.5V17M1 9h1.5M15.5 9H17M3.22 3.22l1.06 1.06M13.72 13.72l1.06 1.06M3.22 14.78l1.06-1.06M13.72 4.28l1.06-1.06' },
  ]

  return (
    <div className="sidebar-transition flex flex-col h-screen flex-shrink-0"
      style={{ width: expanded ? 220 : 60, background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}
      onMouseEnter={() => !pinned && setHovered(true)}
      onMouseLeave={() => !pinned && setHovered(false)}>

      {/* Logo */}
      <div className="flex items-center px-4 h-16 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-light)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--primary-mid)', boxShadow: '0 2px 8px rgba(46,95,163,0.35)' }}>
          <span className="text-white font-bold mono text-sm">B</span>
        </div>
        {expanded && (
          <div className="ml-3 overflow-hidden">
            <p className="text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>BOSS</p>
            <p className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Client Portal</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(item => {
          const active = current === item.id
          return (
            <button key={item.id} onClick={() => onChange(item.id)}
              title={!expanded ? item.label : undefined}
              className="w-full flex items-center rounded-xl transition-all duration-150"
              style={{ padding: '9px 10px',
                background: active ? 'rgba(46,95,163,0.1)' : 'transparent',
                color: active ? 'var(--primary-mid)' : 'var(--text-secondary)' }}>
              <span className="flex-shrink-0"><Icon d={item.d} active={active} /></span>
              {expanded && (
                <span className="ml-3 text-sm font-medium whitespace-nowrap"
                  style={{ color: active ? 'var(--primary-mid)' : 'var(--text-secondary)' }}>
                  {item.label}
                </span>
              )}
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--primary-mid)' }} />
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 pb-3" style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
        <button onClick={() => setPinned(p => !p)} title={expanded ? undefined : (pinned ? 'Unpin' : 'Pin')}
          className="w-full flex items-center rounded-xl transition-colors px-2.5 py-2"
          style={{ color: 'var(--text-muted)' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z"
              stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
              fill={pinned ? 'currentColor' : 'none'} />
          </svg>
          {expanded && <span className="ml-3 text-xs">{pinned ? 'Pinned' : 'Pin sidebar'}</span>}
        </button>
      </div>
    </div>
  )
}

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
  useEffect(() => { run() }, deps) // eslint-disable-line
  return { data, loading, error, refetch: run }
}
