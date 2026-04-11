import { useEffect, useState } from 'react'
import { api, type Campaign, type Lead } from '../lib/api'
import {
  Table, TierBadge, StatusPill, ScoreBadge, ProgressBar,
  SlideOver, Skeleton, EmptyState
} from '../components/ui'

function LeadDetail({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email

  return (
    <SlideOver open title={name} onClose={onClose}>
      <div className="space-y-6">
        {/* Contact */}
        <section>
          <h3 className="text-xs text-muted uppercase tracking-wider mb-3">Contact</h3>
          <div className="space-y-2">
            {[
              ['Email', lead.email],
              ['Title', lead.title],
              ['Company', lead.company],
              ['Industry', lead.industry],
              ['Company size', lead.company_size],
              ['Country', lead.country],
              ['Seniority', lead.seniority],
            ].map(([l, v]) => v ? (
              <div key={l} className="flex justify-between text-sm">
                <span className="text-muted">{l}</span>
                <span className="text-primary mono">{v}</span>
              </div>
            ) : null)}
          </div>
        </section>

        {/* ICP Score */}
        <section>
          <h3 className="text-xs text-muted uppercase tracking-wider mb-3">ICP Score</h3>
          <div className="flex items-center gap-3">
            <ScoreBadge score={lead.icp_score} />
            <StatusPill status={lead.status} />
          </div>
        </section>

        {/* BANT */}
        {lead.bant_score !== undefined && (
          <section>
            <h3 className="text-xs text-muted uppercase tracking-wider mb-3">BANT Qualification</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                ['Budget', lead.bant_budget],
                ['Authority', lead.bant_authority],
                ['Need', lead.bant_need],
                ['Timeline', lead.bant_timeline],
              ].map(([l, v]) => (
                <div key={l} className="glass px-3 py-2">
                  <p className="text-muted text-xs mb-1">{l}</p>
                  <p className="text-primary text-xs mono">{v ?? '—'}</p>
                </div>
              ))}
            </div>
            {lead.bant_notes && (
              <p className="text-secondary text-xs leading-relaxed">{lead.bant_notes}</p>
            )}
          </section>
        )}

        {/* Custom Q Answers */}
        {lead.custom_answers && lead.custom_answers.length > 0 && (
          <section>
            <h3 className="text-xs text-muted uppercase tracking-wider mb-3">Custom Q&A</h3>
            <div className="space-y-3">
              {lead.custom_answers.map((qa, i) => (
                <div key={i} className="glass px-3 py-2">
                  <p className="text-secondary text-xs mb-1">{qa.question}</p>
                  <p className="text-primary text-sm">{qa.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Rejection reason */}
        {lead.rejection_reason && (
          <section className="px-3 py-3 rounded-lg border border-red-800/30 bg-red-900/10">
            <p className="text-xs text-red-400 uppercase tracking-wider mb-1">Rejection reason</p>
            <p className="text-slate-300 text-sm">{lead.rejection_reason}</p>
          </section>
        )}
      </div>
    </SlideOver>
  )
}

function CampaignDetail({ campaign, onBack }: { campaign: Campaign; onBack: () => void }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [filters, setFilters] = useState({ status: '', min_score: '' })

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.min_score) params.set('min_score', filters.min_score)
    api.getCampaignLeads(campaign.id, params.toString())
      .then(r => setLeads(Array.isArray(r) ? r : r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [campaign.id, filters])

  const exportCsv = () => {
    if (!leads.length) return
    const cols = ['email', 'first_name', 'last_name', 'title', 'company', 'icp_score', 'status']
    const rows = leads.map(l => cols.map(c => JSON.stringify((l as Record<string, unknown>)[c] ?? '')).join(','))
    const csv = [cols.join(','), ...rows].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${campaign.name}-leads.csv`
    a.click()
  }

  return (
    <div className="fade-up p-6 max-w-6xl mx-auto">
      <div className="px-6 pt-6 pb-4 flex items-center gap-3">
        <button onClick={onBack} className="text-muted hover:text-slate-300 transition-colors text-sm">← Back</button>
        <div>
          <h1 className="text-lg font-medium text-slate-100">{campaign.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <TierBadge tier={campaign.product_tier} />
            <StatusPill status={campaign.status} />
          </div>
        </div>
      </div>

      <div className="px-6 mb-5">
        <ProgressBar delivered={campaign.leads_delivered} ordered={campaign.leads_ordered} />
        <div className="flex gap-6 mt-3 text-sm text-secondary mono">
          <span>CPL: <span className="text-primary">${campaign.cpl}</span></span>
          <span>Rejected: <span className="text-primary">{campaign.leads_rejected}</span></span>
        </div>
      </div>

      <div className="glass">
        <div className="px-5 py-3 border-b border-light flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-medium text-slate-300 flex-1">Leads</h2>
          <select
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
            className="bg-black/05 border border-white/08 rounded px-2 py-1 text-xs text-slate-300"
          >
            <option value="">All statuses</option>
            {['accepted', 'reviewing', 'rejected', 'duplicate'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filters.min_score}
            onChange={e => setFilters(f => ({ ...f, min_score: e.target.value }))}
            className="bg-black/05 border border-white/08 rounded px-2 py-1 text-xs text-slate-300"
          >
            <option value="">Any score</option>
            <option value="70">70+ (High)</option>
            <option value="45">45+ (Mid)</option>
          </select>
          <button onClick={exportCsv} className="text-xs style={{ color: "var(--primary-mid)" }} hover:text-white transition-colors">
            Export CSV
          </button>
        </div>

        <Table
          columns={[
            { key: 'name', label: 'Name', render: r => [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email },
            { key: 'email', label: 'Email', mono: true },
            { key: 'company', label: 'Company' },
            { key: 'title', label: 'Title' },
            { key: 'icp_score', label: 'ICP', render: r => <ScoreBadge score={r.icp_score} /> },
            { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
          ]}
          data={leads}
          loading={loading}
          onRowClick={setSelectedLead}
          emptyMessage="No leads found"
        />
      </div>

      {selectedLead && <LeadDetail lead={selectedLead} onClose={() => setSelectedLead(null)} />}
    </div>
  )
}

export default function Campaigns({ initialId }: { initialId?: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Campaign | null>(null)

  useEffect(() => {
    api.getCampaigns()
      .then(c => {
        setCampaigns(c)
        if (initialId) {
          const found = c.find(x => x.id === initialId)
          if (found) setSelected(found)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [initialId])

  if (selected) return <CampaignDetail campaign={selected} onBack={() => setSelected(null)} />

  return (
    <div className="fade-up p-6 max-w-6xl mx-auto">
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-lg font-medium text-slate-100">Campaigns</h1>
        <p className="text-muted text-sm mt-0.5">All campaigns across your account</p>
      </div>

      <div className="glass">
        {loading ? (
          <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : !campaigns.length ? (
          <EmptyState message="No campaigns yet" />
        ) : (
          <div className="divide-y divide-white/04">
            {campaigns.map(c => (
              <div key={c.id}
                onClick={() => setSelected(c)}
                className="px-5 py-4 hover:bg-white/02 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span className="text-primary text-sm font-medium">{c.name}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <TierBadge tier={c.product_tier} />
                      <StatusPill status={c.status} />
                      <span className="text-muted mono text-xs">${c.cpl}/lead</span>
                    </div>
                  </div>
                  <span className="text-muted mono text-xs whitespace-nowrap">
                    {c.leads_rejected} rejected
                  </span>
                </div>
                <ProgressBar delivered={c.leads_delivered} ordered={c.leads_ordered} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
