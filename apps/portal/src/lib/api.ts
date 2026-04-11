const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787/api/v1'

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('boss_token')
  const apiKey = localStorage.getItem('boss_api_key')
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  if (apiKey) h['X-API-Key'] = apiKey
  return h
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...getHeaders(), ...init?.headers } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`)
  }
  const json = await res.json()
  return json.data ?? json
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    req<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  // Campaigns
  getCampaigns: () => req<Campaign[]>('/campaigns'),
  getCampaign: (id: string) => req<Campaign>(`/campaigns/${id}`),
  getCampaignLeads: (id: string, params?: string) => req<{ data: Lead[]; meta: Meta }>(`/campaigns/${id}/leads${params ? '?' + params : ''}`),
  getCampaignStats: (id: string) => req<CampaignStats>(`/campaigns/${id}/stats`),

  // Leads
  getLead: (id: string) => req<Lead>(`/leads/${id}`),
  rejectLead: (id: string, reason: string) =>
    req<Lead>(`/leads/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Delivery
  getBatches: (campaignId: string) => req<DeliveryBatch[]>(`/campaigns/${campaignId}/batches`),
  getBatchDownloadUrl: (batchId: string) => req<{ url: string }>(`/delivery/batches/${batchId}/download`),

  // Invoices
  getInvoices: () => req<Invoice[]>('/invoices'),

  // Reports
  getClientMetrics: (clientId: string) => req<ClientMetrics>(`/clients/${clientId}/metrics`),
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface User { id: string; email: string; role: string; tenant_id: string }
export interface Meta { total: number; page: number; per_page: number }

export interface Campaign {
  id: string; name: string; product_tier: string; status: string
  leads_ordered: number; leads_delivered: number; leads_rejected: number
  cpl: number; client_id: string; start_date?: number; end_date?: number
  custom_questions?: CustomQuestion[]
}

export interface CustomQuestion { id: string; question: string; type: string; required: boolean }

export interface Lead {
  id: string; first_name?: string; last_name?: string; email: string
  title?: string; company?: string; industry?: string; company_size?: string
  country?: string; seniority?: string; icp_score?: number; status: string
  bant_score?: number; bant_budget?: string; bant_authority?: string
  bant_need?: string; bant_timeline?: string; bant_notes?: string
  custom_answers?: Array<{ question_id: string; question: string; answer: string }>
  delivered_at?: number; rejection_reason?: string; client_rejected?: number
}

export interface DeliveryBatch {
  id: string; campaign_id: string; lead_count: number
  status: string; sent_at?: number; r2_key: string
}

export interface Invoice {
  id: string; total: number; status: string; due_date: number
  paid_at?: number; created_at: number; chase_level: number
}

export interface CampaignStats {
  total_leads: number; accepted: number; rejected: number
  avg_icp_score: number; delivered: number
}

export interface ClientMetrics {
  total_campaigns: number; active_campaigns: number
  total_leads_delivered: number; avg_cpl: number; total_spend: number
}
