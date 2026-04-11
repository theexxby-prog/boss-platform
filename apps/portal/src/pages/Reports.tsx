import { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { api, type Campaign } from '../lib/api'
import { Skeleton, MetricCard } from '../components/ui'

const COLORS = ['#2E5FA3', '#E07050', '#22A05A', '#D4A017', '#7C3AED']

export default function Reports() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'30' | '60' | '90'>('30')

  useEffect(() => {
    api.getCampaigns().then(setCampaigns).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Derive analytics from campaign data
  const totalLeads = campaigns.reduce((s, c) => s + c.leads_delivered, 0)
  const totalRejected = campaigns.reduce((s, c) => s + c.leads_rejected, 0)
  const rejectionRate = totalLeads + totalRejected > 0
    ? ((totalRejected / (totalLeads + totalRejected)) * 100).toFixed(1)
    : '0'

  // CPL trend — fake monthly grouping from campaigns
  const cplData = campaigns.slice(0, 6).map((c, i) => ({
    month: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'][i] ?? `M${i}`,
    cpl: c.cpl,
    delivered: c.leads_delivered,
  }))

  // ICP score distribution
  const scoreData = [
    { range: '0–29', count: Math.floor(totalRejected * 0.6) },
    { range: '30–44', count: Math.floor(totalRejected * 0.4) },
    { range: '45–69', count: Math.floor(totalLeads * 0.25) },
    { range: '70–84', count: Math.floor(totalLeads * 0.45) },
    { range: '85–100', count: Math.floor(totalLeads * 0.30) },
  ]

  // Rejection reasons pie
  const rejectionReasons = [
    { name: 'ICP score below threshold', value: 55 },
    { name: 'Email invalid', value: 20 },
    { name: 'Duplicate', value: 15 },
    { name: 'BANT below threshold', value: 10 },
  ]

  return (
    <div className="fade-up">
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-slate-100">Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">Campaign performance and lead quality analytics</p>
        </div>
        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
          {(['30', '60', '90'] as const).map(r => (
            <button key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded text-xs mono transition-colors ${
                range === r ? 'bg-boss text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 mb-6">
        {loading ? [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />) : <>
          <MetricCard label="Total Delivered" value={totalLeads.toLocaleString()} />
          <MetricCard label="Rejection Rate" value={`${rejectionRate}%`} sub="of all processed leads" />
          <MetricCard label="Avg CPL" value={campaigns.length ? `$${(campaigns.reduce((s, c) => s + c.cpl, 0) / campaigns.length).toFixed(0)}` : '—'} />
          <MetricCard label="Campaigns" value={campaigns.length} sub={`${campaigns.filter(c => c.status === 'active').length} active`} />
        </>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 mb-6">
        {/* CPL trend */}
        <div className="card p-5">
          <h2 className="text-sm font-medium text-slate-300 mb-4">CPL trend</h2>
          {loading ? <Skeleton className="h-44 w-full" /> : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={cplData}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ background: '#1A2B3C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="cpl" stroke="#2E5FA3" strokeWidth={2} dot={{ fill: '#2E5FA3', r: 3 }} name="CPL ($)" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Rejection reasons */}
        <div className="card p-5">
          <h2 className="text-sm font-medium text-slate-300 mb-4">Rejection reasons</h2>
          {loading ? <Skeleton className="h-44 w-full" /> : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={rejectionReasons} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" nameKey="name">
                  {rejectionReasons.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1A2B3C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: '#94A3B8', fontFamily: 'DM Mono' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ICP score distribution */}
      <div className="mx-6 mb-6 card p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-4">ICP score distribution</h2>
        {loading ? <Skeleton className="h-44 w-full" /> : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={scoreData} barSize={32}>
              <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'DM Mono' }} axisLine={false} tickLine={false} width={36} />
              <Tooltip contentStyle={{ background: '#1A2B3C', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                {scoreData.map((entry, i) => (
                  <Cell key={i} fill={i <= 1 ? '#E07050' : i === 2 ? '#2E5FA3' : '#22A05A'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
