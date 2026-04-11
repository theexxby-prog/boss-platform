import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { adminApi, type Tenant, type OpsKpi, type Financials, type Domain } from '../lib/api'

// ─── Shared primitives ────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card p-5 ${className}`}>{children}</div>
}

function Stat({ label, value, sub, danger }: { label: string; value: string | number; sub?: string; danger?: boolean }) {
  return (
    <Card>
      <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">{label}</p>
      <p className={`mono text-2xl font-medium ${danger ? 'text-red-400' : 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </Card>
  )
}

function SlaBar({ deadline, created }: { deadline: number; created: number }) {
  const total = deadline - created
  const remaining = deadline - Date.now()
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100))
  const color = pct > 50 ? '#22A05A' : pct > 20 ? '#D4A017' : '#E07050'
  return (
    <div className="w-24">
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="mono text-xs mt-0.5" style={{ color }}>
        {remaining > 0 ? `${Math.round(remaining / 3600000)}h left` : 'OVERDUE'}
      </p>
    </div>
  )
}

// ─── Page: Tenants ────────────────────────────────────────────────────────────

export function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.getTenants().then(setTenants).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const totalMrr = tenants.reduce((s, t) => s + (t.mrr ?? 0), 0)

  return (
    <div className="fade-up">
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-slate-100">Tenants</h1>
          <p className="text-slate-500 text-sm mt-0.5">{tenants.length} accounts · ${totalMrr.toLocaleString()} MRR total</p>
        </div>
        <button className="px-3 py-1.5 bg-boss hover:bg-boss-light text-white text-sm rounded-lg transition-colors">
          + New tenant
        </button>
      </div>

      <div className="mx-6 card overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/06">
                {['Tenant', 'Plan', 'Users', 'Active campaigns', 'MRR (30d)', 'Status'].map(h => (
                  <th key={h} className="text-left text-slate-500 text-xs uppercase tracking-wider px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id} className="border-b border-white/04 hover:bg-white/02 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-slate-200 font-medium">{t.name}</p>
                    <p className="text-slate-500 mono text-xs">{t.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="bg-boss/20 text-boss-light border border-boss/30 text-xs mono px-2 py-0.5 rounded capitalize">
                      {t.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 mono text-slate-300">{t.user_count ?? 0}</td>
                  <td className="px-4 py-3 mono text-slate-300">{t.active_campaigns ?? 0}</td>
                  <td className="px-4 py-3 mono text-slate-200">${(t.mrr ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      t.status === 'active' ? 'bg-green-900/20 text-green-400' : 'bg-slate-700 text-slate-400'
                    }`}>{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Page: Ops KPI ────────────────────────────────────────────────────────────

export function OpsKpiPage() {
  const [kpi, setKpi] = useState<OpsKpi | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.getOpsKpi().then(setKpi).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div className="fade-up">
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-lg font-medium text-slate-100">Ops KPI</h1>
        <p className="text-slate-500 text-sm mt-0.5">India ops queue, SLA tracking, today's throughput</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 mb-5">
        {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />) : <>
          <Stat label="Processed today" value={kpi?.today.processed_today ?? 0} />
          <Stat label="Accepted" value={kpi?.today.accepted_today ?? 0} />
          <Stat label="Rejected" value={kpi?.today.rejected_today ?? 0} />
          <Stat label="SLA breaches" value={kpi?.sla_breaches ?? 0} danger={(kpi?.sla_breaches ?? 0) > 0} />
        </>}
      </div>

      <div className="mx-6 card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-white/06">
          <h2 className="text-sm font-medium text-slate-300">
            Open queue — {kpi?.open_queue.length ?? 0} items
          </h2>
        </div>
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !kpi?.open_queue.length ? (
          <div className="px-5 py-12 text-center text-slate-500 text-sm">Queue is clear ✓</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/06">
                {['Task', 'Priority', 'Assigned', 'SLA'].map(h => (
                  <th key={h} className="text-left text-slate-500 text-xs uppercase tracking-wider px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kpi.open_queue.slice(0, 20).map(item => (
                <tr key={item.id} className="border-b border-white/04 hover:bg-white/02 transition-colors">
                  <td className="px-4 py-3 max-w-sm">
                    <p className="text-slate-200 text-xs truncate">{item.description}</p>
                    <p className="text-slate-500 mono text-xs mt-0.5">{item.task_type}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      item.priority === 'high' ? 'bg-red-900/20 text-red-400' : 'bg-slate-700 text-slate-400'
                    }`}>{item.priority}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs mono">{item.assigned_email ?? 'Unassigned'}</td>
                  <td className="px-4 py-3">
                    <SlaBar deadline={item.sla_deadline} created={item.created_at} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Page: Financials ─────────────────────────────────────────────────────────

export function FinancialsPage() {
  const [fin, setFin] = useState<Financials | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.getFinancials().then(setFin).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const aging = fin?.ar_aging
  const agingTotal = aging ? Object.values(aging).reduce((s, v) => s + v, 0) : 0
  const splitData = fin ? [
    { name: 'Aggregator', value: fin.revenue_split.aggregator },
    { name: 'Direct', value: fin.revenue_split.direct },
  ] : []

  return (
    <div className="fade-up">
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-lg font-medium text-slate-100">Financials</h1>
        <p className="text-slate-500 text-sm mt-0.5">MRR, AR aging, revenue split</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 mb-5">
        {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />) : <>
          <Stat label="MRR (30d)" value={`$${(fin?.mrr ?? 0).toLocaleString()}`}
            sub={fin?.mrr_growth_pct != null ? `${fin.mrr_growth_pct > 0 ? '+' : ''}${fin.mrr_growth_pct}% vs prior month` : undefined} />
          <Stat label="Outstanding AR" value={`$${(fin?.outstanding_invoices.total ?? 0).toLocaleString()}`}
            sub={`${fin?.outstanding_invoices.count ?? 0} invoices`}
            danger={(fin?.outstanding_invoices.total ?? 0) > 0} />
          <Stat label="Aggregator rev" value={`$${(fin?.revenue_split.aggregator ?? 0).toLocaleString()}`} />
          <Stat label="Direct rev" value={`$${(fin?.revenue_split.direct ?? 0).toLocaleString()}`} />
        </>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 mb-6">
        {/* AR Aging */}
        <Card>
          <h2 className="text-sm font-medium text-slate-300 mb-4">AR aging — ${agingTotal.toLocaleString()} overdue</h2>
          {loading ? <Skeleton className="h-40 w-full" /> : (
            <div className="space-y-3">
              {[
                { label: '0–30 days', value: aging?.bucket_0_30 ?? 0, color: '#22A05A' },
                { label: '31–60 days', value: aging?.bucket_31_60 ?? 0, color: '#D4A017' },
                { label: '61–90 days', value: aging?.bucket_61_90 ?? 0, color: '#E07050' },
                { label: '90+ days', value: aging?.bucket_90_plus ?? 0, color: '#C23030' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mono mb-1">
                    <span className="text-slate-400">{label}</span>
                    <span className="text-slate-200">${value.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: agingTotal > 0 ? `${(value / agingTotal) * 100}%` : '0%',
                      background: color,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Revenue split */}
        <Card>
          <h2 className="text-sm font-medium text-slate-300 mb-4">Revenue split (30d)</h2>
          {loading ? <Skeleton className="h-40 w-full" /> : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={splitData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value">
                    {splitData.map((_, i) => <Cell key={i} fill={['#2E5FA3', '#0D6B72'][i]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {splitData.map((d, i) => (
                  <div key={d.name}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: ['#2E5FA3', '#0D6B72'][i] }} />
                      <span className="text-slate-400 text-xs">{d.name}</span>
                    </div>
                    <p className="mono text-slate-100 text-sm ml-4">${d.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Monthly trend */}
      <div className="mx-6 mb-6 card p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-4">Monthly revenue trend</h2>
        {loading ? <Skeleton className="h-44 w-full" /> : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={fin?.monthly_trend ?? []}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} width={48}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: '#1A2B3C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, 'Revenue']} />
              <Line type="monotone" dataKey="revenue" stroke="#2E5FA3" strokeWidth={2} dot={{ fill: '#2E5FA3', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ─── Page: Domain Health ──────────────────────────────────────────────────────

export function DomainHealthPage() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [suspending, setSuspending] = useState<string | null>(null)

  useEffect(() => {
    adminApi.getDomainHealth().then(setDomains).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const suspend = async (id: string) => {
    setSuspending(id)
    try {
      await adminApi.suspendDomain(id)
      setDomains(ds => ds.map(d => d.id === id ? { ...d, is_active: 0, health_status: 'red' } : d))
    } catch { /* show nothing — domain still shows in list */ }
    finally { setSuspending(null) }
  }

  const statusDot = (s: 'green' | 'amber' | 'red') => {
    const colors = { green: '#22A05A', amber: '#D4A017', red: '#E07050' }
    return <span className="w-2 h-2 rounded-full inline-block" style={{ background: colors[s] }} />
  }

  const pct = (v: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '—'

  return (
    <div className="fade-up">
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-slate-100">Domain health</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {domains.filter(d => d.health_status === 'red').length} red ·{' '}
            {domains.filter(d => d.health_status === 'amber').length} amber ·{' '}
            {domains.filter(d => d.health_status === 'green').length} green
          </p>
        </div>
      </div>

      <div className="mx-6 card overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/06">
                {['Status', 'Domain', 'Tenant', 'Spam rate', 'Bounce rate', 'Daily sends', 'Actions'].map(h => (
                  <th key={h} className="text-left text-slate-500 text-xs uppercase tracking-wider px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {domains.map(d => (
                <tr key={d.id} className="border-b border-white/04 hover:bg-white/02 transition-colors">
                  <td className="px-4 py-3">{statusDot(d.health_status)}</td>
                  <td className="px-4 py-3 mono text-slate-200">{d.domain}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{d.tenant_name}</td>
                  <td className="px-4 py-3 mono">
                    <span className={d.spam_rate && d.spam_rate > 0.02 ? 'text-red-400' : 'text-slate-300'}>
                      {pct(d.spam_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 mono">
                    <span className={d.bounce_rate && d.bounce_rate > 0.05 ? 'text-amber-400' : 'text-slate-300'}>
                      {pct(d.bounce_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-3 mono text-slate-300">
                    {d.daily_send_count} / {d.daily_send_limit}
                  </td>
                  <td className="px-4 py-3">
                    {d.is_active ? (
                      <button
                        onClick={() => suspend(d.id)}
                        disabled={suspending === d.id}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                      >
                        {suspending === d.id ? 'Suspending…' : 'Suspend'}
                      </button>
                    ) : (
                      <span className="text-slate-600 text-xs">Suspended</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
