const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787/api/v1'

function headers(): Record<string, string> {
  const token = localStorage.getItem('boss_admin_token')
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers(), ...init?.headers } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`)
  }
  const json = await res.json()
  return json.data ?? json
}

export const adminApi = {
  login: (email: string, password: string) =>
    req<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  getTenants:     () => req<Tenant[]>('/admin/tenants'),
  getOpsKpi:      () => req<OpsKpi>('/admin/ops/kpi'),
  getFinancials:  () => req<Financials>('/admin/financials'),
  getDomainHealth: () => req<Domain[]>('/admin/domain-health'),
  suspendDomain:  (id: string) => req<Domain>(`/admin/domain-health/${id}/suspend`, { method: 'POST' }),
}

export interface Tenant {
  id: string; name: string; slug: string; plan: string; status: string
  user_count: number; active_campaigns: number; mrr: number; created_at: number
}

export interface OpsQueueItem {
  id: string; tenant_id: string; lead_id?: string; task_type: string
  priority: string; description: string; assigned_email?: string
  sla_deadline: number; created_at: number; status: string
}

export interface OpsKpi {
  open_queue: OpsQueueItem[]
  sla_breaches: number
  today: { processed_today: number; accepted_today: number; rejected_today: number; duplicate_today: number }
}

export interface Financials {
  mrr: number
  mrr_growth_pct: number | null
  ar_aging: { bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90_plus: number }
  revenue_split: { aggregator: number; direct: number }
  monthly_trend: Array<{ month: string; revenue: number }>
  outstanding_invoices: { count: number; total: number }
}

export interface Domain {
  id: string; tenant_id: string; tenant_name: string; domain: string
  reputation_score: number | null; bounce_rate: number | null
  spam_rate: number | null; is_active: number; daily_send_count: number
  daily_send_limit: number; health_status: 'green' | 'amber' | 'red'
  last_health_check: number | null
}
