import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { api, type Campaign, type Invoice } from '../lib/api'
import { MetricCard, Skeleton, StatusPill, TierBadge, ProgressBar } from '../components/ui'

function ARBanner({ invoices }: { invoices: Invoice[] }) {
  const overdue = invoices.filter(i => i.status === 'sent' && i.due_date < Date.now())
  if (!overdue.length) return null
  const total = overdue.reduce((s, i) => s + i.total, 0)
  return (
    <div className="mx-6 mt-5 px-4 py-3 rounded-xl flex items-center justify-between"
      style={{ background: 'var(--danger-bg)', border: '1px solid rgba(220,38,38,0.2)' }}>
      <div className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--danger)' }} />
        <span className="text-sm" style={{ color: 'var(--danger)' }}>
          {overdue.length} invoice{overdue.length > 1 ? 's' : ''} overdue — ${total.toLocaleString()} outstanding
        </span>
      </div>
      <span className="text-xs font-medium mono" style={{ color: 'var(--danger)' }}>Action required</span>
    </div>
  )
}

const TIER_COLORS: Record<string, string> = {
  mql: '#2E5FA3', custom_q: '#7C3AED', bant: '#0D6B72', bant_appt: '#059669',
}

export default function Dashboard({ onNavigate }: { onNavigate: (page: string, id?: string) => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getCampaigns(), api.getInvoices()])
      .then(([c, inv]) => { setCampaigns(c); setInvoices(Array.isArray(inv) ? inv : []) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  const active = campaigns.filter(c => c.status === 'active')
  const totalDelivered = campaigns.reduce((s, c) => s + c.leads_delivered, 0)
  const avgCpl = campaigns.length
    ? `$${(campaigns.reduce((s, c) => s + c.cpl, 0) / campaigns.length).toFixed(0)}`
    : '$—'

  const chartData = active.slice(0, 8).map(c => ({
    name: c.name.length > 18 ? c.name.slice(0, 16) + '…' : c.name,
    ordered: c.leads_ordered,
    delivered: c.leads_delivered,
    tier: c.product_tier,
  }))

  return (
    <div className="fade-up p-6 max-w-6xl mx-auto">
      <ARBanner invoices={invoices} />

      <div className="mb-6 mt-2">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Dashboard</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />) : <>
          <MetricCard label="Active campaigns" value={active.length}
            sub={`${campaigns.length} total`} accent />
          <MetricCard label="Leads delivered" value={totalDelivered.toLocaleString()} />
          <MetricCard label="Campaigns complete"
            value={campaigns.filter(c => c.status === 'complete').length} />
          <MetricCard label="Avg CPL" value={avgCpl} />
        </>}
      </div>

      {/* Chart + Recent side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {/* Chart */}
        <div className="lg:col-span-3 glass p-5">
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Ordered vs delivered — active campaigns
          </h2>
          {loading ? <Skeleton className="h-52 w-full" /> : chartData.length ? (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData} barGap={3} barSize={14}>
                <XAxis dataKey="name"
                  tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'DM Mono' }}
                  axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)', fontFamily: 'DM Mono' }}
                  axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  contentStyle={{ background: 'var(--glass-bg-strong)',
                    border: '1px solid var(--glass-border)', borderRadius: 10,
                    fontSize: 12, backdropFilter: 'blur(12px)' }}
                  labelStyle={{ color: 'var(--text-secondary)', fontFamily: 'DM Mono' }}
                  itemStyle={{ color: 'var(--text-primary)' }} />
                <Bar dataKey="ordered" fill="rgba(0,0,0,0.08)" radius={[3,3,0,0]} name="Ordered" />
                <Bar dataKey="delivered" radius={[3,3,0,0]} name="Delivered">
                  {chartData.map((e, i) => <Cell key={i} fill={TIER_COLORS[e.tier] ?? '#2E5FA3'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
              No active campaigns
            </div>
          )}
        </div>

        {/* Recent campaigns */}
        <div className="lg:col-span-2 glass">
          <div className="px-5 py-4 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border-light)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent</h2>
            <button onClick={() => onNavigate('campaigns')}
              className="text-xs font-medium transition-opacity hover:opacity-60"
              style={{ color: 'var(--primary-mid)' }}>View all →</button>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : (
            <div>
              {campaigns.slice(0, 5).map((c, i) => (
                <div key={c.id} onClick={() => onNavigate('campaigns', c.id)}
                  className="px-5 py-3.5 cursor-pointer transition-colors"
                  style={{ borderBottom: i < 4 ? '1px solid var(--border-light)' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                      {c.name}
                    </span>
                    <TierBadge tier={c.product_tier} />
                  </div>
                  <ProgressBar delivered={c.leads_delivered} ordered={c.leads_ordered} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Invoices */}
      {!loading && invoices.filter(i => i.status === 'sent').length > 0 && (
        <div className="glass">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-light)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Outstanding invoices</h2>
          </div>
          <div>
            {invoices.filter(i => i.status === 'sent').slice(0, 3).map((inv, i, arr) => (
              <div key={inv.id} className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <div>
                  <p className="mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    ${inv.total.toLocaleString()}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Due {new Date(inv.due_date).toLocaleDateString()}
                  </p>
                </div>
                <StatusPill status={inv.due_date < Date.now() ? 'rejected' : 'sent'} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
