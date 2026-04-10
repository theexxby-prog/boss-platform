CREATE TABLE tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'starter',
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(tenant_id, email)
);

CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  key_hash    TEXT NOT NULL UNIQUE,
  key_prefix  TEXT NOT NULL,
  name        TEXT NOT NULL,
  last_used   INTEGER,
  expires_at  INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE clients (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
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

CREATE TABLE icp_profiles (
  id                  TEXT PRIMARY KEY,
  client_id           TEXT NOT NULL REFERENCES clients(id),
  industries          TEXT NOT NULL,
  company_sizes       TEXT NOT NULL,
  geographies         TEXT NOT NULL,
  titles_include      TEXT NOT NULL,
  titles_exclude      TEXT NOT NULL DEFAULT '[]',
  seniorities         TEXT NOT NULL,
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

CREATE TABLE campaigns (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  client_id        TEXT NOT NULL REFERENCES clients(id),
  icp_profile_id   TEXT NOT NULL REFERENCES icp_profiles(id),
  name             TEXT NOT NULL,
  external_ref     TEXT,
  product_tier     TEXT NOT NULL,
  leads_ordered    INTEGER NOT NULL,
  leads_delivered  INTEGER NOT NULL DEFAULT 0,
  leads_rejected   INTEGER NOT NULL DEFAULT 0,
  cpl              REAL NOT NULL,
  appt_price       REAL DEFAULT 0,
  custom_questions TEXT DEFAULT '[]',
  bant_budget_min  TEXT,
  bant_timeline    TEXT,
  bant_need_desc   TEXT,
  status           TEXT NOT NULL DEFAULT 'draft',
  start_date       INTEGER,
  end_date         INTEGER,
  daily_cap        INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX idx_campaigns_client ON campaigns(client_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);

CREATE TABLE leads (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL REFERENCES tenants(id),
  campaign_id            TEXT NOT NULL REFERENCES campaigns(id),
  first_name             TEXT,
  last_name              TEXT,
  email                  TEXT NOT NULL,
  phone                  TEXT,
  title                  TEXT,
  company                TEXT,
  company_domain         TEXT,
  linkedin_url           TEXT,
  industry               TEXT,
  company_size           TEXT,
  country                TEXT,
  state                  TEXT,
  seniority              TEXT,
  tech_stack             TEXT DEFAULT '[]',
  email_status           TEXT,
  email_score            REAL,
  icp_score              INTEGER,
  icp_score_breakdown    TEXT,
  icp_reasons            TEXT DEFAULT '[]',
  custom_answers         TEXT DEFAULT '[]',
  bant_budget            TEXT,
  bant_authority         TEXT,
  bant_need              TEXT,
  bant_timeline          TEXT,
  bant_score             INTEGER,
  bant_confidence        TEXT,
  bant_notes             TEXT,
  appt_scheduled_at      INTEGER,
  appt_calendar_link     TEXT,
  appt_status            TEXT,
  status                 TEXT NOT NULL DEFAULT 'ingested',
  rejection_reason       TEXT,
  ops_reviewer_id        TEXT REFERENCES users(id),
  delivered_at           INTEGER,
  delivery_batch_id      TEXT,
  client_rejected        INTEGER DEFAULT 0,
  client_rejected_reason TEXT,
  client_rejected_at     INTEGER,
  replacement_lead_id    TEXT REFERENCES leads(id),
  dedup_hash             TEXT NOT NULL,
  source_domain          TEXT,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

CREATE INDEX idx_leads_campaign ON leads(campaign_id);
CREATE INDEX idx_leads_status ON leads(status, tenant_id);
CREATE INDEX idx_leads_email ON leads(email, tenant_id);
CREATE INDEX idx_leads_dedup ON leads(dedup_hash, tenant_id);
CREATE INDEX idx_leads_delivered ON leads(delivered_at, campaign_id);

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

CREATE TABLE invoices (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  client_id     TEXT NOT NULL REFERENCES clients(id),
  line_items    TEXT NOT NULL,
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
CREATE INDEX idx_invoices_due ON invoices(due_date, status);

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
CREATE INDEX idx_ops_queue_sla ON ops_queue(sla_deadline, status);
