# BOSS Agency Platform — Codex Master Build Prompt
**Version:** 2.0 | **Date:** April 2026  
**For:** OpenAI Codex (execution agent)  
**Supervised by:** Claude Code (review + architectural oversight)  
**Owner:** Vishal Mehta, BOSS Platform  
**Reference repo:** `github.com/theexxby-prog/BOSS` branch `work`

---

## CRITICAL READING INSTRUCTIONS FOR CODEX

Read this entire document before writing a single line of code.

Every module has:
- A **reference mapping** — the exact file in boss-hq to study first
- An **input/output contract** — the exact shape of data in and out
- **Acceptance criteria** — the definition of done
- A **Claude Code gate** — modules marked `[CC-GATE]` must be reviewed by Claude Code before proceeding

**Do not skip gates. Do not invent schema that contradicts the contracts. Do not use libraries not in the approved stack. When in doubt, write `// CODEX-QUESTION: [your question]` and Claude Code will answer in review.**

---

## PART 1 — REFERENCE CODEBASE GUIDE

The existing platform at `github.com/theexxby-prog/BOSS` (branch: `work`) is a **production-quality single-tenant internal agency tool**. It runs on Cloudflare Workers + Hono + D1, which is identical to the new platform's stack.

**You MUST study the reference files before writing each module.** The patterns are already proven. Your job is to adapt them for multi-tenancy, not reinvent them.

### What to reference vs skip

| Reference file (boss-hq) | Use for | Notes |
|---|---|---|
| `worker/src/index.ts` | Worker entry point, Hono app setup, middleware registration | Copy structure exactly, add tenant middleware |
| `worker/src/cors.ts` | CORS config | Copy directly |
| `worker/src/http.ts` | Response helpers (`ok()`, `err()`, etc.) | Copy directly |
| `worker/src/db.ts` | D1 query patterns, typed queries | Study pattern, new schema — do NOT copy queries |
| `worker/src/types.ts` | Hono env type bindings, context types | Adapt for multi-tenant env |
| `worker/src/routes/campaigns.ts` | Campaign CRUD route structure | Adapt: add `tenant_id` to every query |
| `worker/src/routes/clients.ts` | Client CRUD route structure | Adapt: add `tenant_id` to every query |
| `worker/src/routes/leads.ts` | Lead ingestion route patterns | Adapt: queue-based async in new version |
| `worker/src/routes/deliveries.ts` | Delivery route patterns | Adapt: add R2 signed URL generation |
| `worker/src/routes/billing.ts` | Invoice/billing route patterns | Adapt for new invoice schema |
| `worker/src/routes/webhooks.ts` | Webhook handler patterns | Adapt: add signature verification |
| `worker/src/routes/sourcing.ts` | CSV parsing, lead sourcing patterns | **Key reference** for lead ingestion |
| `worker/src/routes/campaign-leads.ts` | Campaign-lead join query patterns | Adapt for new schema |
| `worker/src/routes/finance.ts` | Financial reporting route patterns | Adapt for multi-tenant |
| `worker/src/routes/settings.ts` | Settings route patterns | Adapt |
| `worker/src/routes/system-logs.ts` | Logging patterns | Copy and adapt |
| `worker/src/routes/bd.ts` | BD pipeline patterns | Adapt |
| `worker/src/routes/documents.ts` | R2 file serving patterns | **Key reference** for R2 signed URLs |
| `worker/src/services/leadService.ts` | Lead business logic | **Key reference** — adapt for queue-based processing |
| `worker/src/services/invoiceService.ts` | Invoice creation, QBO sync | **Key reference** — adapt for new schema |
| `worker/src/services/campaignRequestService.ts` | Campaign request handling | **Key reference** for campaign state machine |
| `worker/src/services/integrationService.ts` | External API integration patterns | **Key reference** — error handling, retry logic |
| `worker/src/services/clientService.ts` | Client service patterns | Adapt for multi-tenant |
| `worker/src/services/reportService.ts` | Report generation | Adapt for new metrics |
| `worker/src/services/billingConfigService.ts` | Billing config patterns | Adapt |
| `worker/src/services/paymentService.ts` | Payment patterns | Adapt |
| `worker/src/providers/DataProvider.ts` | Data abstraction pattern | Study — use same pattern for new services |
| `worker/src/providers/mockProvider.ts` | Mock/test patterns | Use for Vitest mocks |
| `worker/migrations/001_add_tables.sql` | Base schema patterns | Study column naming conventions |
| `worker/migrations/010_global_leads.sql` | Leads table structure | Reference for new leads table design |
| `worker/migrations/011_billing.sql` | Billing table structure | Reference for invoice schema |
| `worker/migrations/012_invoice_unique.sql` | Invoice constraints | Reference for unique constraint patterns |

### What NOT to reference

| File | Reason |
|---|---|
| `worker/src/routes/generate-page.ts` | Internal landing page tool — not relevant |
| `worker/src/routes/landing-page.ts` | Internal only |
| `worker/src/routes/job-cards.ts` | Internal only |
| `worker/src/routes/pages.ts` | Internal only |
| `worker/src/routes/social.ts` | Internal only |
| `worker/src/routes/clean.ts` | Internal DB cleanup utility |
| `worker/src/services/clientTeamService.ts` | Single-tenant team model — multi-tenant uses users table instead |
| Any schema/query that does NOT filter by tenant | Every query in the new platform MUST have tenant_id |

### The single most important rule about references
When you borrow a pattern, add this comment above it:
```typescript
// REF: boss-hq/worker/src/services/integrationService.ts — error wrapping pattern
```
This lets Claude Code immediately verify you've used the right source.

---

## PART 2 — TECH STACK (APPROVED ONLY)

### Runtime & framework
```
Runtime:        Cloudflare Workers (ES modules) — identical to boss-hq
Framework:      Hono v4 (hono/hono) — identical to boss-hq
Language:       TypeScript (strict mode, no any)
Package mgr:    pnpm (workspaces monorepo)
```

### Data layer
```
Primary DB:     Cloudflare D1 (SQLite) — identical to boss-hq
Object storage: Cloudflare R2 — identical to boss-hq
Cache / KV:     Cloudflare KV
Job queue:      Cloudflare Queues (NEW — not in boss-hq)
Cron:           Cloudflare Cron Triggers (NEW — not in boss-hq)
```

### AI & enrichment
```
AI:             Anthropic Claude API
                Model: claude-sonnet-4-20250514 (exact string, never change)
                Max tokens: 1024 scoring, 2048 BANT, 4096 reports
Enrichment:     ZeroBounce API v2
                Apollo.io API v1
                Clearbit Enrichment API (fallback)
```

### External integrations
```
Email outreach: Instantly.ai REST API v2
CRM:            HubSpot CRM API v3
Invoicing:      QuickBooks Online API
Calendar:       Google Calendar API
```

### Frontend
```
Framework:      React 18 + TypeScript
Bundler:        Vite → Cloudflare Pages
Styling:        Tailwind CSS v3
Charts:         Recharts
Tables:         TanStack Table v8
State:          Zustand
HTTP client:    ky
```

### Testing
```
Unit:           Vitest
E2E:            Playwright
CF Workers:     @cloudflare/vitest-pool-workers
```

---

## PART 3 — MONOREPO STRUCTURE

```
boss-platform/
├── apps/
│   ├── api/                          # Cloudflare Workers API (Hono)
│   │   ├── src/
│   │   │   ├── index.ts              # REF: boss-hq/worker/src/index.ts
│   │   │   ├── cors.ts               # REF: boss-hq/worker/src/cors.ts (copy + adapt)
│   │   │   ├── http.ts               # REF: boss-hq/worker/src/http.ts (copy + adapt)
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts           # NEW — no reference
│   │   │   │   ├── campaigns.ts      # REF: boss-hq routes/campaigns.ts + campaign-leads.ts
│   │   │   │   ├── leads.ts          # REF: boss-hq routes/leads.ts + sourcing.ts
│   │   │   │   ├── clients.ts        # REF: boss-hq routes/clients.ts
│   │   │   │   ├── aggregators.ts    # REF: boss-hq routes/clients.ts (aggregators are clients)
│   │   │   │   ├── delivery.ts       # REF: boss-hq routes/deliveries.ts + documents.ts
│   │   │   │   ├── invoices.ts       # REF: boss-hq routes/billing.ts
│   │   │   │   ├── webhooks.ts       # REF: boss-hq routes/webhooks.ts
│   │   │   │   ├── domains.ts        # NEW — no reference
│   │   │   │   └── admin.ts          # REF: boss-hq routes/finance.ts + system-logs.ts
│   │   │   ├── services/
│   │   │   │   ├── icp-scorer.ts     # [CC-GATE] Claude Code writes this — do not implement
│   │   │   │   ├── enrichment.ts     # REF: boss-hq services/integrationService.ts
│   │   │   │   ├── bant-qualifier.ts # [CC-GATE] Claude Code writes this — do not implement
│   │   │   │   ├── appointment.ts    # REF: boss-hq services/integrationService.ts (patterns)
│   │   │   │   ├── delivery.ts       # REF: boss-hq services/invoiceService.ts + leadService.ts
│   │   │   │   ├── invoicing.ts      # REF: boss-hq services/invoiceService.ts
│   │   │   │   └── domain-rotation.ts # NEW — no reference
│   │   │   ├── queues/
│   │   │   │   ├── lead-processor.ts # REF: boss-hq services/leadService.ts (adapt for queue)
│   │   │   │   └── delivery-processor.ts
│   │   │   ├── crons/
│   │   │   │   ├── ar-chase.ts       # REF: boss-hq services/invoiceService.ts (payment terms logic)
│   │   │   │   ├── renewal-alerts.ts # REF: boss-hq services/campaignRequestService.ts
│   │   │   │   └── deliverability-monitor.ts # NEW
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts           # NEW — JWT + API key
│   │   │   │   ├── tenant.ts         # NEW — tenant isolation (most important middleware)
│   │   │   │   └── rate-limit.ts     # NEW — KV-based rate limiting
│   │   │   ├── db/
│   │   │   │   ├── schema.sql        # NEW schema — study boss-hq migrations for column conventions
│   │   │   │   ├── queries/          # REF: boss-hq/worker/src/db.ts pattern for typed queries
│   │   │   │   └── migrations/
│   │   │   └── lib/
│   │   │       ├── claude.ts         # NEW — Claude API client
│   │   │       ├── zerobounce.ts     # REF: boss-hq services/integrationService.ts patterns
│   │   │       ├── apollo.ts         # REF: boss-hq services/integrationService.ts patterns
│   │   │       ├── instantly.ts      # REF: boss-hq services/integrationService.ts patterns
│   │   │       ├── hubspot.ts        # REF: boss-hq services/integrationService.ts patterns
│   │   │       ├── quickbooks.ts     # REF: boss-hq services/paymentService.ts patterns
│   │   │       └── errors.ts         # REF: boss-hq services/integrationService.ts error handling
│   │   ├── wrangler.toml
│   │   └── package.json
│   ├── portal/                       # Client-facing React app
│   └── admin/                        # Internal admin React app
├── packages/
│   ├── types/                        # Shared TypeScript types
│   └── utils/
├── workflows/                        # n8n workflow JSON
├── docs/
├── pnpm-workspace.yaml
└── CLAUDE.md
```

---

## PART 4 — DATABASE SCHEMA

Study `boss-hq/worker/migrations/001_add_tables.sql` through `012_invoice_unique.sql` for column naming conventions and constraint patterns before writing any of this. The new schema is multi-tenant — every table except `tenants` has a `tenant_id` column.

```sql
-- ============================================================
-- TENANCY
-- ============================================================
CREATE TABLE tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'starter',
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- ============================================================
-- AUTH
-- ============================================================
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,           -- owner | admin | viewer | ops
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(tenant_id, email)
);

CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  key_hash    TEXT NOT NULL UNIQUE,      -- SHA-256 of raw key
  key_prefix  TEXT NOT NULL,            -- first 8 chars: sk-boss-XXXXXXXX
  name        TEXT NOT NULL,
  last_used   INTEGER,
  expires_at  INTEGER,
  created_at  INTEGER NOT NULL
);

-- ============================================================
-- CLIENTS (aggregators and direct clients both live here)
-- ============================================================
CREATE TABLE clients (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,         -- aggregator | direct
  status          TEXT NOT NULL DEFAULT 'active',
  hubspot_id      TEXT,
  payment_terms   INTEGER NOT NULL DEFAULT 30,
  billing_email   TEXT NOT NULL,
  revenue_cap_pct INTEGER DEFAULT 25,
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_clients_tenant ON clients(tenant_id);

-- ============================================================
-- ICP PROFILES
-- ============================================================
CREATE TABLE icp_profiles (
  id                  TEXT PRIMARY KEY,
  client_id           TEXT NOT NULL REFERENCES clients(id),
  industries          TEXT NOT NULL,     -- JSON array
  company_sizes       TEXT NOT NULL,     -- JSON array: "1-50"|"51-200"|"201-1000"|"1000+"
  geographies         TEXT NOT NULL,     -- JSON array of country codes
  titles_include      TEXT NOT NULL,     -- JSON array of title keywords (OR logic)
  titles_exclude      TEXT NOT NULL DEFAULT '[]',
  seniorities         TEXT NOT NULL,     -- JSON array: "C-level"|"VP"|"Director"|"Manager"
  tech_include        TEXT DEFAULT '[]',
  tech_exclude        TEXT DEFAULT '[]',
  weight_industry     INTEGER NOT NULL DEFAULT 25,
  weight_seniority    INTEGER NOT NULL DEFAULT 25,
  weight_company_size INTEGER NOT NULL DEFAULT 20,
  weight_geography    INTEGER NOT NULL DEFAULT 15,
  weight_tech         INTEGER NOT NULL DEFAULT 15,
  min_score_accept    INTEGER NOT NULL DEFAULT 60,
  min_score_review    INTEGER NOT NULL DEFAULT 45,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE campaigns (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  client_id       TEXT NOT NULL REFERENCES clients(id),
  icp_profile_id  TEXT NOT NULL REFERENCES icp_profiles(id),
  name            TEXT NOT NULL,
  external_ref    TEXT,
  product_tier    TEXT NOT NULL,         -- mql | custom_q | bant | bant_appt
  leads_ordered   INTEGER NOT NULL,
  leads_delivered INTEGER NOT NULL DEFAULT 0,
  leads_rejected  INTEGER NOT NULL DEFAULT 0,
  cpl             REAL NOT NULL,
  appt_price      REAL DEFAULT 0,
  custom_questions TEXT DEFAULT '[]',   -- JSON array of {id, question, type, required}
  bant_budget_min TEXT,
  bant_timeline   TEXT,
  bant_need_desc  TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  start_date      INTEGER,
  end_date        INTEGER,
  daily_cap       INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX idx_campaigns_client ON campaigns(client_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE leads (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  campaign_id         TEXT NOT NULL REFERENCES campaigns(id),
  -- Raw contact
  first_name          TEXT,
  last_name           TEXT,
  email               TEXT NOT NULL,
  phone               TEXT,
  title               TEXT,
  company             TEXT,
  company_domain      TEXT,
  linkedin_url        TEXT,
  -- Enriched
  industry            TEXT,
  company_size        TEXT,
  country             TEXT,
  state               TEXT,
  seniority           TEXT,
  tech_stack          TEXT DEFAULT '[]',
  -- Email validation
  email_status        TEXT,
  email_score         REAL,
  -- ICP scoring
  icp_score           INTEGER,
  icp_score_breakdown TEXT,             -- JSON
  icp_reasons         TEXT DEFAULT '[]',
  -- Custom Q answers
  custom_answers      TEXT DEFAULT '[]',
  -- BANT
  bant_budget         TEXT,
  bant_authority      TEXT,
  bant_need           TEXT,
  bant_timeline       TEXT,
  bant_score          INTEGER,
  bant_confidence     TEXT,
  bant_notes          TEXT,
  -- Appointment
  appt_scheduled_at   INTEGER,
  appt_calendar_link  TEXT,
  appt_status         TEXT,
  -- Processing
  status              TEXT NOT NULL DEFAULT 'ingested',
  rejection_reason    TEXT,
  ops_reviewer_id     TEXT REFERENCES users(id),
  -- Delivery
  delivered_at        INTEGER,
  delivery_batch_id   TEXT,
  client_rejected     INTEGER DEFAULT 0,
  client_rejected_reason TEXT,
  client_rejected_at  INTEGER,
  replacement_lead_id TEXT REFERENCES leads(id),
  -- Dedup
  dedup_hash          TEXT NOT NULL,    -- SHA-256(email + tenant_id)
  -- Source
  source_domain       TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX idx_leads_campaign   ON leads(campaign_id);
CREATE INDEX idx_leads_status     ON leads(status, tenant_id);
CREATE INDEX idx_leads_email      ON leads(email, tenant_id);
CREATE INDEX idx_leads_dedup      ON leads(dedup_hash, tenant_id);
CREATE INDEX idx_leads_delivered  ON leads(delivered_at, campaign_id);

-- ============================================================
-- DELIVERY BATCHES
-- ============================================================
CREATE TABLE delivery_batches (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  campaign_id     TEXT NOT NULL REFERENCES campaigns(id),
  lead_count      INTEGER NOT NULL,
  r2_key          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  sent_at         INTEGER,
  acknowledged_at INTEGER,
  invoice_id      TEXT REFERENCES invoices(id),
  created_at      INTEGER NOT NULL
);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  client_id     TEXT NOT NULL REFERENCES clients(id),
  line_items    TEXT NOT NULL,           -- JSON array
  subtotal      REAL NOT NULL,
  tax_rate      REAL NOT NULL DEFAULT 0,
  tax_amount    REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft',
  due_date      INTEGER NOT NULL,
  paid_at       INTEGER,
  quickbooks_id TEXT,
  chase_level   INTEGER NOT NULL DEFAULT 0,
  last_chase_at INTEGER,
  notes         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX idx_invoices_client ON invoices(client_id, status);
CREATE INDEX idx_invoices_due    ON invoices(due_date, status);

-- ============================================================
-- SENDING DOMAINS
-- ============================================================
CREATE TABLE sending_domains (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id),
  domain            TEXT NOT NULL,
  reputation_score  REAL,
  bounce_rate       REAL,
  spam_rate         REAL,
  is_active         INTEGER NOT NULL DEFAULT 1,
  is_warming        INTEGER NOT NULL DEFAULT 0,
  daily_send_count  INTEGER NOT NULL DEFAULT 0,
  daily_send_limit  INTEGER NOT NULL DEFAULT 50,
  spf_valid         INTEGER DEFAULT 0,
  dkim_valid        INTEGER DEFAULT 0,
  dmarc_valid       INTEGER DEFAULT 0,
  last_health_check INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  UNIQUE(tenant_id, domain)
);

-- ============================================================
-- OPS QUEUE
-- ============================================================
CREATE TABLE ops_queue (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  lead_id      TEXT REFERENCES leads(id),
  task_type    TEXT NOT NULL,
  priority     TEXT NOT NULL DEFAULT 'normal',
  description  TEXT NOT NULL,
  assigned_to  TEXT REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'open',
  resolution   TEXT,
  resolved_at  INTEGER,
  sla_deadline INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX idx_ops_queue_status ON ops_queue(status, tenant_id, priority);
CREATE INDEX idx_ops_queue_sla    ON ops_queue(sla_deadline, status);
```

---

## PART 5 — SHARED TYPES

```typescript
// packages/types/src/lead.ts

export type LeadStatus =
  | 'ingested' | 'enriching' | 'scoring'
  | 'reviewing' | 'accepted' | 'rejected' | 'duplicate';

export type CompanySize = '1-50' | '51-200' | '201-1000' | '1000+';
export type Seniority = 'C-level' | 'VP' | 'Director' | 'Manager' | 'Individual';
export type EmailStatus = 'valid' | 'invalid' | 'catch-all' | 'unknown';
export type BantConfidence = 'high' | 'medium' | 'low';
export type AppointmentStatus = 'pending' | 'scheduled' | 'completed' | 'no-show';

export interface RawLead {
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  title?: string;
  company?: string;
  company_domain?: string;
  linkedin_url?: string;
}

export interface EnrichedLead extends RawLead {
  industry?: string;
  company_size?: CompanySize;
  country?: string;
  state?: string;
  seniority?: Seniority;
  tech_stack?: string[];
  email_status?: EmailStatus;
  email_score?: number;
}

export interface IcpScoreBreakdown {
  industry: number;
  seniority: number;
  company_size: number;
  geography: number;
  tech: number;
}

export type ScoreDecision = 'accept' | 'review' | 'reject';

export interface ScoringResult {
  score: number;
  breakdown: IcpScoreBreakdown;
  reasons: string[];
  decision: ScoreDecision;
}

export interface CustomAnswer {
  question_id: string;
  question: string;
  answer: string;
}

export interface BantResult {
  budget: string | null;
  authority: string | null;
  need: string | null;
  timeline: string | null;
  score: number;
  confidence: BantConfidence;
  notes: string;
}

// packages/types/src/campaign.ts

export type ProductTier = 'mql' | 'custom_q' | 'bant' | 'bant_appt';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'complete' | 'cancelled';

export interface CustomQuestion {
  id: string;
  question: string;
  type: 'text' | 'boolean' | 'select';
  options?: string[];
  required: boolean;
}

// packages/types/src/scoring.ts

export interface IcpProfile {
  id: string;
  client_id: string;
  industries: string[];
  company_sizes: CompanySize[];
  geographies: string[];
  titles_include: string[];
  titles_exclude: string[];
  seniorities: Seniority[];
  tech_include: string[];
  tech_exclude: string[];
  weight_industry: number;
  weight_seniority: number;
  weight_company_size: number;
  weight_geography: number;
  weight_tech: number;
  min_score_accept: number;
  min_score_review: number;
}
```

---

## PART 6 — API ROUTES CONTRACT

Base: `/api/v1`  
Auth: `Authorization: Bearer <jwt>` or `X-API-Key: sk-boss-<key>`  
Response shape: `{ data: T, meta?: object }` success | `{ error: { code, message, details? } }` failure  
**Every single D1 query MUST filter by `tenant_id` — no exceptions.**

```
AUTH
POST   /auth/login              → { token, user }
POST   /auth/logout             → 204
POST   /auth/refresh            → { token }
GET    /auth/api-keys           → { data: ApiKey[] }
POST   /auth/api-keys           → { key (raw, shown once), id }
DELETE /auth/api-keys/:id       → 204

CLIENTS
GET    /clients                 → { data: Client[], meta }
POST   /clients                 → { data: Client }
GET    /clients/:id             → { data: Client }
PUT    /clients/:id             → { data: Client }
GET    /clients/:id/campaigns   → { data: Campaign[] }
GET    /clients/:id/invoices    → { data: Invoice[] }
GET    /clients/:id/metrics     → { data: ClientMetrics }

CAMPAIGNS
GET    /campaigns               → { data: Campaign[], meta }
POST   /campaigns               → { data: Campaign }
GET    /campaigns/:id           → { data: Campaign }
PUT    /campaigns/:id           → { data: Campaign }
POST   /campaigns/:id/activate  → { data: Campaign }
POST   /campaigns/:id/pause     → { data: Campaign }
GET    /campaigns/:id/leads     → { data: Lead[], meta }
GET    /campaigns/:id/stats     → { data: CampaignStats }
GET    /campaigns/:id/batches   → { data: DeliveryBatch[] }

LEADS
POST   /leads/ingest            → { queued, rejected, duplicate }
                                  Body: { campaign_id, leads: RawLead[] } max 500
GET    /leads/:id               → { data: Lead }
POST   /leads/:id/reject        → { data: Lead }  (client rejects a delivered lead)
GET    /leads/ops-queue         → { data: OpsQueueItem[] }
PUT    /leads/ops-queue/:id     → { data: OpsQueueItem }

DELIVERY
POST   /delivery/batches        → { data: DeliveryBatch }
GET    /delivery/batches/:id    → { data: DeliveryBatch }
GET    /delivery/batches/:id/download → 302 to R2 signed URL (24hr)
POST   /delivery/batches/:id/resend  → 204

INVOICES
GET    /invoices                → { data: Invoice[], meta }
GET    /invoices/:id            → { data: Invoice }
POST   /invoices/:id/send       → 204
POST   /invoices/:id/mark-paid  → { data: Invoice }
GET    /invoices/overdue        → { data: Invoice[] }

DOMAINS
GET    /domains                 → { data: SendingDomain[] }
POST   /domains                 → { data: SendingDomain }
PUT    /domains/:id/health      → { data: SendingDomain }
POST   /domains/rotate          → { selected_domain, domain_id }

WEBHOOKS
POST   /webhooks/instantly      → 204
POST   /webhooks/hubspot        → 204

ADMIN (separate auth — internal only)
GET    /admin/tenants           → { data: Tenant[] }
POST   /admin/tenants           → { data: Tenant }
GET    /admin/ops/kpi           → { data: OpsKpiDashboard }
GET    /admin/financials        → { data: FinancialSummary }
GET    /admin/domain-health     → { data: DomainHealthSummary }
```

---

## PART 7 — SERVICE SPECS

### 7.1 Enrichment Service
`apps/api/src/services/enrichment.ts`  
**REF:** `boss-hq/worker/src/services/integrationService.ts` — use the same error wrapping pattern, timeout handling, and retry logic.

**Input:** `RawLead`  
**Output:** `EnrichedLead`  
**Error:** Throw `EnrichmentError({ service: 'zerobounce'|'apollo'|'clearbit', reason: string })`

**Pipeline:**
1. ZeroBounce `/v2/validate?email=` — if `status: 'invalid'` AND `score < 3` → skip Apollo, return with `email_status: 'invalid'`
2. Apollo `/v1/people/match` — map response to EnrichedLead fields
3. If Apollo miss → Clearbit `/v2/combined/find?email=` fallback
4. Return enriched lead (partial OK — never throw if enrichment is incomplete)

**Apollo → EnrichedLead field mapping:**
```
person.title                           → title (if raw was empty)
person.seniority                       → seniority (map via table below)
organization.industry                  → industry
organization.estimated_num_employees   → company_size (map via table below)
person.location.country                → country
person.location.state                  → state
organization.technologies              → tech_stack (array of names)
person.linkedin_url                    → linkedin_url (if raw was empty)
```

**Apollo seniority mapping:**
```
"c_suite" | "owner" → "C-level"
"vp"                → "VP"
"director"          → "Director"
"manager"           → "Manager"
everything else     → "Individual"
```

**Employee count → CompanySize:**
```
1–50    → "1-50"
51–200  → "51-200"
201–1000 → "201-1000"
> 1000  → "1000+"
```

**Acceptance criteria:**
- [ ] Returns `EnrichedLead` for all inputs including API failures
- [ ] Never throws unhandled exceptions
- [ ] Apollo not called on hard-invalid emails
- [ ] Clearbit fallback fires only on Apollo miss
- [ ] All API calls: 10s timeout, 1 retry on 5xx with 2s delay
- [ ] Test: valid email → enriched with company data
- [ ] Test: invalid email → `email_status: 'invalid'`, no Apollo call
- [ ] Test: Apollo miss → Clearbit fills gap
- [ ] Test: all APIs fail → returns `RawLead` with `email_status: 'unknown'`, no throw

---

### 7.2 Delivery Service
`apps/api/src/services/delivery.ts`  
**REF:** `boss-hq/worker/src/services/invoiceService.ts` for invoice creation + QBO sync pattern.  
**REF:** `boss-hq/worker/src/routes/documents.ts` for R2 upload and signed URL generation.  
**REF:** `boss-hq/worker/src/services/leadService.ts` for batch lead fetching pattern.

**Input:**
```typescript
interface DeliveryRequest {
  campaign_id: string;
  tenant_id: string;
  lead_ids: string[];        // max 500
  notify_client: boolean;
}
```
**Output:** `DeliveryBatch`

**Steps:**
1. Fetch leads from D1 (verify campaign + tenant match)
2. Generate Excel via `xlsx` package — columns vary by product tier:
   - All tiers: First Name, Last Name, Email, Phone, Title, Company, Domain, LinkedIn, Industry, Company Size, Country, ICP Score
   - `custom_q`+: add Custom Q answer columns
   - `bant`+: add Budget, Authority, Need, Timeline, BANT Score
   - `bant_appt`: add Appointment Date, Calendar Link
3. Upload Excel to R2: `{tenant_id}/deliveries/{campaign_id}/{batch_id}.xlsx`
4. Generate PDF summary (1 page): campaign name, date, lead count, CPL, total value
5. Upload PDF to R2: `{tenant_id}/deliveries/{campaign_id}/{batch_id}-summary.pdf`
6. If `notify_client`: email client with both attachments via tenant SMTP config
7. Create invoice as `draft` in D1 with line items
8. Push invoice to QuickBooks if configured
9. Update `campaigns.leads_delivered` atomically in D1 transaction
10. Return `DeliveryBatch`

**Acceptance criteria:**
- [ ] Excel columns match product tier exactly
- [ ] R2 upload failure = full rollback, no partial delivery
- [ ] Invoice created as `draft`, not auto-sent
- [ ] `leads_delivered` updated atomically
- [ ] `notify_client: false` → no email, file still uploaded
- [ ] Test: MQL campaign → no BANT/CQ columns in Excel
- [ ] Test: BANT campaign → all BANT columns present
- [ ] Test: QBO configured → invoice synced; QBO absent → invoice in D1 only

---

### 7.3 Domain Rotation Service
`apps/api/src/services/domain-rotation.ts`  
**REF:** No direct reference — new functionality. Use KV patterns from boss-hq index.ts.

**Input:** `tenant_id: string`  
**Output:** `{ domain: string; domain_id: string }`  
**Throws:** `NoDomainAvailableError` (typed, not generic Error)

**Algorithm:**
1. Fetch active, non-warming domains for tenant from D1
2. Filter: `daily_send_count < daily_send_limit` AND `bounce_rate <= 0.05` AND `spam_rate <= 0.01`
3. If empty: throw `NoDomainAvailableError`, write alert to KV notification queue
4. Sort: `reputation_score DESC`, then `daily_send_count ASC`
5. Select first
6. Increment `daily_send_count` atomically in D1
7. Store selection in KV with 1-hour TTL
8. Return selected domain

**Cron** (`crons/deliverability-monitor.ts`) — schedule: `0 */6 * * *`:
- Refresh health metrics from warmup tool API for all active domains
- Auto-suspend any domain where `spam_rate > 0.02`
- Reset `daily_send_count = 0` at midnight UTC for all domains

**Acceptance criteria:**
- [ ] Always returns healthiest available domain
- [ ] Throws `NoDomainAvailableError` (not Error) when none available
- [ ] `daily_send_count` increment is atomic
- [ ] Cron resets counts at midnight UTC
- [ ] Cron auto-suspends dangerous domains
- [ ] Test: all domains at capacity → throws NoDomainAvailableError
- [ ] Test: dirty domain + clean domain → always returns clean

---

### 7.4 AR Chase Cron
`apps/api/src/crons/ar-chase.ts`  
**REF:** `boss-hq/worker/src/services/invoiceService.ts` — payment terms and overdue detection logic.  
**Schedule:** `0 9 * * *`

**Logic:**
1. Fetch `status = 'sent'` invoices where `due_date < now()`
2. For each: days overdue = `Math.floor((now() - due_date) / 86400000)`
3. Escalation (one level per run only):
   - `days >= 45` AND `chase_level < 3` → level-3 email + pause client campaigns
   - `days >= 35` AND `chase_level < 2` → level-2 email
   - `days >= 22` AND `chase_level < 1` → level-1 email
4. Update `chase_level` and `last_chase_at` in D1
5. Log to `chase_log` table

**Acceptance criteria:**
- [ ] One level escalation per run maximum
- [ ] Level 3 pauses active campaigns in D1
- [ ] Idempotent — re-run doesn't double-send
- [ ] Test: 23 days, level 0 → level-1 email, chase_level → 1
- [ ] Test: 36 days, level 1 → level-2 email, chase_level → 2
- [ ] Test: same invoice, same day, re-run → no second email

---

### 7.5 Renewal Alert Cron
`apps/api/src/crons/renewal-alerts.ts`  
**REF:** `boss-hq/worker/src/services/campaignRequestService.ts` — campaign state detection.  
**Schedule:** `0 8 * * *`

**Logic:**
1. Fetch active campaigns where `leads_delivered >= leads_ordered * 0.8`
2. Check KV flag `renewal-alert:{campaign_id}` — skip if set
3. Create `ops_queue` record: `task_type: 'renewal_alert'`, assign to BD hire
4. Send Slack webhook (URL from tenant KV config)
5. Set KV flag with 14-day TTL

**Acceptance criteria:**
- [ ] Only fires at >= 80% delivered
- [ ] 14-day dedup via KV
- [ ] Creates ops_queue record AND Slack notification
- [ ] Test: 79% → no alert; 80% → alert; re-run same day → no duplicate

---

## PART 8 — QUEUE CONSUMER

`apps/api/src/queues/lead-processor.ts`  
**REF:** `boss-hq/worker/src/services/leadService.ts` — adapt the lead processing steps for async queue execution.

**Message shape:**
```typescript
interface LeadProcessorMessage {
  lead_id: string;
  campaign_id: string;
  tenant_id: string;
}
```

**Processing pipeline** (update D1 status after each step):
```
1. status → 'enriching'    → call enrichment service → save to D1

2. Dedup check             → SHA-256(email + tenant_id) vs D1 last 90 days
                           → if duplicate: status → 'duplicate', stop

3. status → 'scoring'      → [CC-GATE stub] call icp-scorer service
                           → save score + breakdown + reasons

4. Route by score:
   ≥ min_score_accept      → status → 'accepted', continue
   ≥ min_score_review      → status → 'reviewing', create ops_queue, stop
   < min_score_review      → status → 'rejected', reason = 'ICP score below threshold', stop

5. custom_q tier+          → [CC-GATE stub] call custom Q answering
                           → save custom_answers to D1

6. bant tier+              → [CC-GATE stub] call bant-qualifier service
                           → save bant fields
                           → if bant_score < 50: status → 'reviewing', ops_queue

7. Daily cap check         → count today's delivered for campaign
                           → if at cap: re-queue with 1-hour delay

8. status → 'accepted'
```

**Error handling:** Any step throws → `status → 'reviewing'`, create ops_queue with error details. Max 3 retries → DLQ → KV alert.

**CC-GATE stubs** — write these exactly, Claude Code fills in the implementation:
```typescript
// icp-scorer stub
async function scoreLeadIcp(lead: EnrichedLead, profile: IcpProfile): Promise<ScoringResult> {
  // CC-GATE: Claude Code implements this using Claude API
  throw new Error('CC-GATE: icp-scorer not yet implemented');
}

// custom Q stub
async function answerCustomQuestions(lead: EnrichedLead, questions: CustomQuestion[]): Promise<CustomAnswer[]> {
  // CC-GATE: Claude Code implements this using Claude API
  throw new Error('CC-GATE: custom-Q answerer not yet implemented');
}

// BANT stub
async function qualifyBant(lead: EnrichedLead, criteria: BantCriteria): Promise<BantResult> {
  // CC-GATE: Claude Code implements this using Claude API
  throw new Error('CC-GATE: bant-qualifier not yet implemented');
}
```

**Acceptance criteria:**
- [ ] Status updated in D1 after each step (real-time portal visibility)
- [ ] Errors create ops_queue records, never drop leads silently
- [ ] Dedup checks email + tenant_id across last 90 days of delivered leads
- [ ] Daily cap re-queues with delay (doesn't drop)
- [ ] CC-GATE stubs throw clearly labelled errors
- [ ] Test: duplicate email same tenant → status 'duplicate'
- [ ] Test: score 35 (below review threshold) → status 'rejected'
- [ ] Test: score 55 (between thresholds) → status 'reviewing', ops_queue created
- [ ] Test: enrichment API fails → ops_queue created, lead not lost

---

## PART 9 — CLIENT PORTAL (React)

**REF:** No direct reference from boss-hq — boss-hq has no React frontend.

### Pages

**Dashboard (`/`):**
- 4 metric cards: Active Campaigns, Leads This Month, Total Delivered, Avg CPL
- Bar chart (Recharts): leads ordered vs delivered per active campaign
- Activity feed: last 10 delivery events
- Overdue AR banner if any invoices past due

**Campaigns (`/campaigns`):**
- TanStack Table: sortable by status / date / delivered
- Columns: Name | Tier badge | Status | Ordered | Delivered | Rejected | CPL | Progress bar
- Campaign detail page: stats + leads table + delivery batches + ICP (read-only)

**Leads (`/campaigns/:id/leads`):**
- TanStack Table + filters: status, ICP score range, country, seniority
- Columns: Name | Email | Company | Title | ICP Score | Status | Delivered date
- Export CSV button
- Lead detail slide-over: all enriched fields + BANT + custom Q answers

**Reports (`/reports`):**
- Date range picker
- CPL trend line chart
- ICP score distribution histogram
- Rejection rate by reason pie chart
- Export PDF button

**Settings (`/settings`):**
- ICP Profile editor (weight sliders that must sum to 100, validated)
- Custom questions editor (add / reorder / remove)
- API key management (generate, list, revoke)
- Notification preferences

### Design rules
- Tailwind CSS only — no Shadcn, no Radix, no MUI
- Colours: navy `#1A2B4A`, blue `#2E5FA3`, teal `#0D6B72`, green `#1A6B3A`
- Font: Inter via Google Fonts
- All tables: skeleton loading state
- All mutations: optimistic UI
- All empty states: illustration + clear CTA

---

## PART 10 — ADMIN PANEL (React)

**Tenants:** Table with plan / MRR / status. Click → tenant detail.

**Ops KPI:**
- Per India ops person: leads processed today, QA rejection rate, SLA breaches
- Open ops_queue: sortable by priority + SLA deadline
- SLA heatmap by hour of day

**Financials:**
- Total MRR across all tenants
- AR aging: 0–30 / 31–60 / 61–90 / 90+ buckets
- Revenue split: aggregator vs direct (Recharts pie)
- Monthly net income trend (Recharts line)

**Domain Health:**
- All sending domains across all tenants
- Columns: Domain | Tenant | Reputation | Bounce Rate | Spam Rate | Daily Sends | Status
- Traffic-light status column (red/amber/green)
- Bulk suspend action

---

## PART 11 — n8n WORKFLOWS

Generate valid n8n v1.x importable JSON for these 5 workflows:

1. **Lead ingestion from aggregator email** — IMAP trigger → parse CSV/Excel attachment → `POST /api/v1/leads/ingest` → Slack result notification
2. **BANT pipeline** — BOSS webhook trigger → [CC-GATE: Claude Code fills prompt] → conditional accept/ops-queue → `PUT /api/v1/leads/:id`
3. **Appointment booking** — BOSS webhook on bant_appt lead accepted → Instantly sequence → wait for reply webhook → Google Calendar event → `PUT /api/v1/leads/:id` → HubSpot deal
4. **AR chase** — Daily cron backup → `GET /api/v1/invoices/overdue` → loop `POST /api/v1/invoices/:id/chase`
5. **Renewal alert** — Daily cron → campaign completion check → Slack + HubSpot task

---

## PART 12 — CLAUDE.md

Place at repo root. Claude Code reads this automatically.

```markdown
# BOSS Agency Platform — Claude Code Instructions

## Your role
Senior architect and reviewer. Codex built the scaffolding.
You implement CC-GATE services and review all output against contracts.

## CC-GATE — YOU implement these (do not leave as stubs after review):
1. `apps/api/src/services/icp-scorer.ts` — ICP scoring via Claude API
2. `apps/api/src/services/bant-qualifier.ts` — BANT qualification via Claude API  
3. Custom question answering in `apps/api/src/queues/lead-processor.ts`

## Reference repo
`github.com/theexxby-prog/BOSS` branch `work`
Key files to study before any review:
- `worker/src/services/integrationService.ts` — error handling patterns
- `worker/src/services/invoiceService.ts` — invoice + QBO sync patterns
- `worker/src/services/leadService.ts` — lead processing patterns
- `worker/src/db.ts` — D1 query patterns

## Architecture rules to enforce
- Every D1 query: filter by `tenant_id` — non-negotiable
- No raw SQL in route handlers — use `db/queries/` functions only
- Input validation with Zod on every route before DB access
- No `any` in TypeScript
- No secrets in code — Cloudflare env bindings only
- All external API calls: timeout + retry (see integrationService.ts pattern)
- Prompt templates in `apps/api/src/lib/prompts/` — never inline

## Claude API usage rules
- Model: `claude-sonnet-4-20250514` — never change without Vishal approval
- Response format: JSON only — validate with Zod before use
- Invalid JSON from Claude: retry once, then throw `ScoringError`
- Max retries: 2 (429 = retry after header delay, 5xx = retry once)

## Review checklist for every Codex PR
- [ ] All acceptance criteria in CODEX_MASTER_PROMPT_v2.md pass
- [ ] No tenant_id missing from any D1 query
- [ ] No raw SQL in route handlers
- [ ] No hardcoded secrets
- [ ] Error handling follows integrationService.ts pattern
- [ ] REF comments present where boss-hq code was referenced
- [ ] Tests exist and pass

## Business context
Owner: Vishal Mehta — independent venture separate from Datamatics role
Stack: Cloudflare Workers + Hono + D1 + R2 + KV + Queues + Cron
Product tiers: MQL ($11–40/lead) → Custom Q ($15–50) → BANT ($50–150) → Appointments ($500)
India ops: 3 people, exceptions only, 24hr SLA
Goal: run with minimal human input — automation is the product
```

---

## PART 13 — BUILD SEQUENCE

Claude Code gates each sprint. Codex does not proceed without CC-GATE sign-off.

```
SPRINT 1 — Foundation
  Task 1:  Monorepo scaffold (pnpm workspaces, all package.json files, tsconfig)
  Task 2:  packages/types — all shared types from Part 5
  Task 3:  apps/api/src/db/schema.sql + migrations/001_initial.sql
  Task 4:  apps/api/src/lib/ — all external API client wrappers
           (stubs with correct TypeScript interfaces — no implementation needed yet)
  Task 5:  apps/api/src/cors.ts + http.ts (REF: boss-hq equivalents)
  Task 6:  apps/api/src/middleware/auth.ts + tenant.ts + rate-limit.ts
  Task 7:  apps/api/src/routes/auth.ts
  ► CC-GATE 1: Claude Code reviews foundation before Sprint 2

SPRINT 2 — Core pipeline
  Task 8:  apps/api/src/db/queries/ — all typed query functions
  Task 9:  apps/api/src/services/enrichment.ts (REF: integrationService.ts)
  Task 10: apps/api/src/queues/lead-processor.ts with CC-GATE stubs
  Task 11: apps/api/src/routes/leads.ts
  ► CC-GATE 2: Claude Code implements icp-scorer.ts + reviews pipeline

SPRINT 3 — Campaign & delivery
  Task 12: apps/api/src/routes/campaigns.ts + clients.ts + aggregators.ts
  Task 13: apps/api/src/services/delivery.ts (REF: invoiceService.ts)
  Task 14: apps/api/src/routes/delivery.ts + invoices.ts
  Task 15: apps/api/src/services/domain-rotation.ts
  Task 16: apps/api/src/routes/domains.ts + webhooks.ts
  ► CC-GATE 3: Claude Code implements bant-qualifier.ts + reviews delivery

SPRINT 4 — Automation
  Task 17: apps/api/src/crons/ — all 3 cron jobs
  Task 18: apps/api/src/routes/admin.ts
  Task 19: workflows/ — all 5 n8n workflow JSON files
  ► CC-GATE 4: Claude Code reviews automation + fills BANT n8n workflow prompt

SPRINT 5 — Frontend
  Task 20: apps/portal/ — all 5 pages + shared components
  Task 21: apps/admin/ — all 4 pages + shared components
  ► CC-GATE 5: Claude Code reviews data flow, auth, and XSS surface

SPRINT 6 — Ship
  Task 22: Test coverage (Vitest unit + Playwright E2E for critical paths)
  Task 23: docs/API.md + docs/RUNBOOK.md
  Task 24: wrangler.toml production config
  ► CC-GATE 6: Final review before first Cloudflare deployment
```

---

## PART 14 — ENVIRONMENT VARIABLES

All in Cloudflare Worker env bindings (production) or `.dev.vars` (local, gitignored):

```
ANTHROPIC_API_KEY=
ZEROBOUNCE_API_KEY=
APOLLO_API_KEY=
CLEARBIT_API_KEY=
INSTANTLY_API_KEY=
HUBSPOT_ACCESS_TOKEN=
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_REFRESH_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
SLACK_WEBHOOK_URL=
JWT_SECRET=              # min 64 chars, random
API_KEY_SALT=            # for SHA-256 hashing

# Cloudflare bindings in wrangler.toml (not here):
# DB (D1), KV (KVNamespace), R2 (R2Bucket), QUEUE (Queue)
```

---

## PART 15 — WHAT CODEX MUST NOT DO

- Do NOT implement `icp-scorer.ts` or `bant-qualifier.ts` — write stubs only
- Do NOT change the schema without CC-GATE review
- Do NOT use npm packages not listed in Part 2
- Do NOT write raw SQL in route handlers — use `db/queries/` functions
- Do NOT use `any` in TypeScript
- Do NOT hardcode API keys, tokens, or secrets
- Do NOT skip tests for the services in Part 7
- Do NOT fork the boss-hq schema — adapt it for multi-tenancy
- Do NOT deploy to production — all deployments require Claude Code sign-off
- Do NOT modify `packages/types` without CC-GATE review

---

*BOSS Agency Platform — Codex Master Build Prompt v2.0*  
*Reference: github.com/theexxby-prog/BOSS (branch: work)*  
*Codex executes. Claude Code reviews. Vishal ships.*
