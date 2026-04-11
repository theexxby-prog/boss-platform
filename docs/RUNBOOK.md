# BOSS Platform — Runbook

## First-time setup (do this once)

### 1. Prerequisites

Install these on your Mac if not already there:

```bash
# Node.js (v20+)
brew install node

# pnpm
npm install -g pnpm

# Wrangler (Cloudflare CLI)
npm install -g wrangler

# Authenticate wrangler with your Cloudflare account
wrangler login
```

### 2. Clone and install

```bash
git clone https://github.com/theexxby-prog/boss-platform.git
cd boss-platform
pnpm install
```

### 3. Create your local secrets file

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Open `apps/api/.dev.vars` and fill in:
- `ANTHROPIC_API_KEY` — your Anthropic key (required for AI scoring to work)
- `JWT_SECRET` — run `openssl rand -hex 32` in terminal, paste result
- `API_KEY_SALT` — run `openssl rand -hex 16` in terminal, paste result
- Everything else is optional for basic local testing

### 4. Create Cloudflare resources (one-time)

Run these commands. Each one prints an ID — copy it into `wrangler.toml`.

```bash
# D1 database
wrangler d1 create boss-platform
# → copy the database_id into wrangler.toml [[d1_databases]]

# KV namespace
wrangler kv namespace create boss-kv
# → copy the id into wrangler.toml [[kv_namespaces]]

# R2 bucket
wrangler r2 bucket create boss-platform-deliveries
# (no ID needed — just the name)

# Queues
wrangler queues create boss-lead-queue
wrangler queues create boss-lead-dlq
```

### 5. Run the database migration

```bash
# Apply schema to local D1
wrangler d1 execute boss-platform --local --file=apps/api/src/db/schema.sql

# Apply schema to production D1 (when ready to deploy)
wrangler d1 execute boss-platform --file=apps/api/src/db/schema.sql
```

### 6. Create your first admin user

Run the interactive seed script — it reads your salt from `.dev.vars`, prompts for a password, hashes it correctly, and inserts the tenant + user into your local D1:

```bash
pnpm seed
```

It will ask for email, tenant slug, tenant name, and password. The defaults work fine for local dev. When it's done it prints the exact credentials to paste into the portal login.

**Portal login fields:**
- Account ID → the tenant slug (e.g. `boss-hq`)
- Email → your admin email
- Password → what you just set

---

## Running locally

### Start the API

```bash
pnpm dev:api
# → API running at http://localhost:8787
# → Health check: http://localhost:8787/api/v1/health
```

### Start the client portal

```bash
# In a new terminal tab
cd apps/portal
echo "VITE_API_URL=http://localhost:8787/api/v1" > .env.local
pnpm dev
# → Portal running at http://localhost:3000
```

Or from the root: `pnpm dev:portal` (set .env.local first)

### Start the admin panel

```bash
# In another terminal tab
cd apps/admin
echo "VITE_API_URL=http://localhost:8787/api/v1" > .env.local
pnpm dev
# → Admin running at http://localhost:3001
```

### Typecheck everything

```bash
pnpm typecheck
# → Should print: ✓ Zero TS errors
```

---

## Deploying to Cloudflare (when ready)

### Deploy the API

```bash
cd apps/api
wrangler deploy
# → Live at: https://boss-platform-api.<your-account>.workers.dev
```

### Set production secrets

Do this once after first deploy — these are stored encrypted in Cloudflare:

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put JWT_SECRET
wrangler secret put API_KEY_SALT
wrangler secret put ZEROBOUNCE_API_KEY
wrangler secret put APOLLO_API_KEY
# ... repeat for each key in .dev.vars.example
```

### Deploy the frontends

```bash
# Portal
cd apps/portal
VITE_API_URL=https://boss-platform-api.<your-account>.workers.dev/api/v1 pnpm build
wrangler pages deploy dist --project-name boss-portal

# Admin
cd apps/admin
VITE_API_URL=https://boss-platform-api.<your-account>.workers.dev/api/v1 pnpm build
wrangler pages deploy dist --project-name boss-admin
```

---

## Custom domain setup (when you have one)

1. Buy domain at Cloudflare Registrar (cheapest, no transfer needed)
2. In Cloudflare dashboard → Workers & Pages → your worker → Custom Domains
3. Add `api.bosshq.com` → API
4. Add `portal.bosshq.com` → boss-portal pages project
5. Add `admin.bosshq.com` → boss-admin pages project
6. Rebuild frontends with new `VITE_API_URL=https://api.bosshq.com/api/v1`

---

## Day-to-day operations

### Check API health
```bash
curl https://boss-platform-api.<your-account>.workers.dev/api/v1/health
```

### View live logs
```bash
wrangler tail
```

### Query the production database
```bash
wrangler d1 execute boss-platform --command="SELECT COUNT(*) FROM leads"
```

### Manually trigger a cron (for testing)
```bash
# AR chase
curl -X POST http://localhost:8787/__scheduled?cron=0+9+*+*+*

# Renewal alerts
curl -X POST http://localhost:8787/__scheduled?cron=0+8+*+*+*

# Deliverability monitor
curl -X POST http://localhost:8787/__scheduled?cron=0+*/6+*+*+*
```

---

## When things break

### Lead stuck in "enriching" or "scoring"
```bash
wrangler d1 execute boss-platform --command="
  SELECT id, email, status, updated_at FROM leads
  WHERE status IN ('enriching', 'scoring')
  AND updated_at < (unixepoch()-3600)*1000
"
```
If leads are stuck > 1 hour, check the ops_queue for error details.

### Ops queue piling up
Check admin panel → Ops KPI. If SLA breaches are growing, either:
- India team needs to clear queue (if human review items)
- API is throwing errors (check `wrangler tail` logs)

### Domain auto-suspended
Check admin panel → Domain Health. Red domains were auto-suspended because spam_rate > 2%.
- Investigate the domain's sending history
- Fix the issue (reduce volume, improve content)
- Re-activate: `UPDATE sending_domains SET is_active = 1 WHERE id = '...'`

### Invoice not syncing to QuickBooks
QBO OAuth tokens expire. Refresh with:
```bash
wrangler secret put QUICKBOOKS_REFRESH_TOKEN
# paste new token from QBO developer console
wrangler deploy
```

---

## Architecture quick reference

```
Cloudflare Workers     — API (Hono + TypeScript)
Cloudflare D1          — SQLite database (all persistent data)
Cloudflare KV          — Cache, dedup flags, rate limiting
Cloudflare R2          — Delivery Excel/PDF file storage
Cloudflare Queues      — Async lead processing pipeline
Cloudflare Pages       — Portal + Admin frontends (React + Vite)
Cloudflare Cron        — AR chase, renewal alerts, deliverability monitor

Claude API             — ICP scoring, BANT qualification, Custom Q answering
ZeroBounce             — Email validation
Apollo.io              — Lead enrichment (company, title, tech stack)
Clearbit               — Enrichment fallback
Instantly.ai           — Email outreach for appointments
HubSpot                — CRM (deals, tasks, contacts)
QuickBooks Online      — Invoice sync
n8n                    — Automation workflows (self-hosted or cloud)
```

---

## Costs at scale (approximate)

| Service | Free tier | Paid starts |
|---|---|---|
| Cloudflare Workers | 100k req/day | $5/mo (10M req) |
| Cloudflare D1 | 5M reads/day | $0.001/M reads |
| Cloudflare R2 | 10GB storage | $0.015/GB |
| Cloudflare KV | 100k reads/day | $0.50/M reads |
| Claude API | Pay per token | ~$3/1M tokens (Sonnet) |
| ZeroBounce | 100 free/mo | $16/mo (2k credits) |
| Apollo.io | 50 exports/mo | $49/mo |

At Mo 6 volumes (~5k leads/month), total infra cost ≈ $50–80/month.
