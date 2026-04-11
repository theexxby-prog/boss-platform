import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { api, type Campaign, type Invoice } from '../lib/api'
import { MetricCard, Skeleton, StatusPill, TierBadge, ProgressBar } from '../components/ui'

function InvoiceBanner({ invoices }: { invoices: Invoice[] }) {
  const overdue = invoices.filter(i => i.status === 'sent' && i.due_date < Date.now())
  if (!overdue.length) return null
  const total = overdue.reduce((s, i) => s + i.total, 0)
  return (
    <div className="mx-6 mt-4 px-4 py-3 rounded-lg border border-red-800/50 bg-red-900/10 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-red-400 text-sm">
          {overdue.length} invoice{overdue.length > 1 ? 's' : ''} overdue — ${total.toLocaleString()} outstanding
        </span>
      </div>
      <span className="text-red-500 text-xs mono">Action required</span>
    </div>
  )
}

export default function Dashboard({ onNavigate }: { onNavigate: (page: string, id?: string) => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getCampaigns(), api.getInvoices()])
      .then(([c, inv]) => { setCampaigns(c); setInvoices(Array.isArray(inv) ? inv : []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const active = campaigns.filter(c => c.status === 'active')
  const totalDelivered = campaigns.reduce((s, c) => s + c.leads_delivered, 0)
  const avgCpl = campaigns.length
    ? (campaigns.reduce((s, c) => s + c.cpl, 0) / campaigns.length).toFixed(2)
    : '0.00'

  const chartData = active.slice(0, 8).map(c => ({
    name: c.name.length > 16 ? c.name.slice(0, 14) + '…' : c.name,
    ordered: c.leads_ordered,
    delivered: c.leads_delivered,
    tier: c.product_tier,
  }))

  const tierColor: Record<string, string> = {
    mql: '#2E5FA3', custom_q: '#7C3AED', bant: '#0D6B72', bant_appt: '#1A6B3A',
  }

  return (
    <div className="fade-up">
      <InvoiceBanner invoices={invoices} />

      <div className="px-6 pt-6 pb-2">
        <h1 className="text-lg font-medium text-slate-100 mb-1">Dashboard</h1>
        <p className="text-slate-500 text-sm">Overview of your active campaigns and delivery</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-4">
        {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />) : <>
          <MetricCard label="Active Campaigns" value={active.length} sub={`${campaigns.length} total`} accent />
          <MetricCard label="Leads This Month" value={totalDelivered.toLocaleString()} />
          <MetricCard label="Total Delivered" value={totalDelivered.toLocaleString()} />
          <MetricCard label="Avg CPL" value={`$${avgCpl}`} />
        </>}
      </div>

      {/* Chart */}
      <div className="mx-6 mb-6 card p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-4">Leads ordered vs delivered — active campaigns</h2>
        {loading ? <Skeleton className="h-48 w-full" /> : chartData.length ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={4} barSize={16}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip
                contentStyle={{ background: '#1A2B3C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94A3B8', fontFamily: 'DM Mono' }}
                itemStyle={{ color: '#E2E8F0', fontFamily: 'DM Mono' }}
              />
              <Bar dataKey="ordered" fill="#334155" radius={[3, 3, 0, 0]} name="Ordered" />
              <Bar dataKey="delivered" radius={[3, 3, 0, 0]} name="Delivered">
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={tierColor[entry.tier] ?? '#2E5FA3'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No active campaigns</div>
        )}
      </div>

      {/* Recent campaigns */}
      <div className="mx-6 mb-6 card">
        <div className="px-5 py-4 border-b border-white/06 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">Recent campaigns</h2>
          <button onClick={() => onNavigate('campaigns')} className="text-boss-light text-xs hover:text-white transition-colors">
            View all →
          </button>
        </div>
        {loading ? (
          <div className="p-4 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : (
          <div className="divide-y divide-white/04">
            {campaigns.slice(0, 5).map(c => (
              <div key={c.id}
                onClick={() => onNavigate('campaigns', c.id)}
                className="px-5 py-3 hover:bg-white/02 cursor-pointer transition-colors flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-slate-200 text-sm font-medium truncate">{c.name}</span>
                    <TierBadge tier={c.product_tier} />
                  </div>
                  <ProgressBar delivered={c.leads_delivered} ordered={c.leads_ordered} />
                </div>
                <StatusPill status={c.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
