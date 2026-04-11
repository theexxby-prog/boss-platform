// REF: boss-hq/worker/src/routes/finance.ts — financial summary patterns
// REF: boss-hq/worker/src/routes/system-logs.ts — admin-only auth pattern
// Admin routes are internal-only — separate auth check (admin role required)

import { Hono } from "hono";
import type { EnvBindings, AppVariables } from "../types";
import { ok, ApiError } from "../http";

const admin = new Hono<{ Bindings: EnvBindings; Variables: AppVariables }>();

// ─── Admin auth guard ─────────────────────────────────────────────────────────
// All admin routes require role = 'admin' | 'owner' on the auth context

admin.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (!auth || (auth.role !== "admin" && auth.role !== "owner")) {
    throw new ApiError(403, "FORBIDDEN", "Admin access required");
  }
  await next();
});

// ─── GET /admin/tenants ───────────────────────────────────────────────────────

admin.get("/tenants", async (c) => {
  const { results: tenants } = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.slug, t.plan, t.status, t.created_at,
            COUNT(DISTINCT u.id)                              AS user_count,
            COUNT(DISTINCT ca.id) FILTER (WHERE ca.status = 'active') AS active_campaigns,
            COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid' AND i.paid_at > ?), 0) AS mrr
     FROM tenants t
     LEFT JOIN users u        ON u.tenant_id = t.id
     LEFT JOIN campaigns ca   ON ca.tenant_id = t.id
     LEFT JOIN invoices i     ON i.tenant_id = t.id
     GROUP BY t.id
     ORDER BY mrr DESC`,
  ).bind(Date.now() - 30 * 24 * 60 * 60 * 1000).all();

  return ok(c, tenants ?? []);
});

// ─── POST /admin/tenants ──────────────────────────────────────────────────────

admin.post("/tenants", async (c) => {
  const body = await c.req.json<{ name: string; plan?: string }>();

  if (!body.name?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "name is required");
  }

  const id = crypto.randomUUID();
  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO tenants (id, name, slug, plan, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(id, body.name.trim(), slug, body.plan ?? "starter", now, now).run();

  const tenant = await c.env.DB.prepare(
    `SELECT * FROM tenants WHERE id = ?`,
  ).bind(id).first();

  return ok(c, tenant);
});

// ─── GET /admin/ops/kpi ───────────────────────────────────────────────────────

admin.get("/ops/kpi", async (c) => {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  // Open ops queue items by priority
  const { results: openQueue } = await c.env.DB.prepare(
    `SELECT oq.id, oq.tenant_id, oq.lead_id, oq.task_type, oq.priority,
            oq.description, oq.assigned_to, oq.sla_deadline, oq.created_at,
            u.email AS assigned_email
     FROM ops_queue oq
     LEFT JOIN users u ON u.id = oq.assigned_to
     WHERE oq.status = 'open'
     ORDER BY oq.priority DESC, oq.sla_deadline ASC
     LIMIT 200`,
  ).all();

  // SLA breaches (sla_deadline < now and still open)
  const { results: slaBreaches } = await c.env.DB.prepare(
    `SELECT COUNT(*) AS breach_count FROM ops_queue
     WHERE status = 'open' AND sla_deadline < ?`,
  ).bind(Date.now()).all<{ breach_count: number }>();

  // Leads processed today across all tenants
  const { results: todayStats } = await c.env.DB.prepare(
    `SELECT
       COUNT(*) FILTER (WHERE status != 'ingested') AS processed_today,
       COUNT(*) FILTER (WHERE status = 'accepted')  AS accepted_today,
       COUNT(*) FILTER (WHERE status = 'rejected')  AS rejected_today,
       COUNT(*) FILTER (WHERE status = 'duplicate') AS duplicate_today
     FROM leads WHERE updated_at >= ?`,
  ).bind(todayStartMs).all();

  return ok(c, {
    open_queue: openQueue ?? [],
    sla_breaches: slaBreaches?.[0]?.breach_count ?? 0,
    today: todayStats?.[0] ?? { processed_today: 0, accepted_today: 0, rejected_today: 0, duplicate_today: 0 },
  });
});

// ─── GET /admin/financials ────────────────────────────────────────────────────

admin.get("/financials", async (c) => {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

  // MRR: invoices paid in last 30 days
  const mrr = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(total), 0) AS mrr FROM invoices
     WHERE status = 'paid' AND paid_at >= ?`,
  ).bind(thirtyDaysAgo).first<{ mrr: number }>();

  // AR aging buckets (overdue = sent + due_date < now)
  const { results: agingRows } = await c.env.DB.prepare(
    `SELECT
       SUM(CASE WHEN ? - due_date < 30  * 86400000 THEN total ELSE 0 END) AS bucket_0_30,
       SUM(CASE WHEN ? - due_date BETWEEN 30  * 86400000 AND 60  * 86400000 - 1 THEN total ELSE 0 END) AS bucket_31_60,
       SUM(CASE WHEN ? - due_date BETWEEN 60  * 86400000 AND 90  * 86400000 - 1 THEN total ELSE 0 END) AS bucket_61_90,
       SUM(CASE WHEN ? - due_date >= 90 * 86400000 THEN total ELSE 0 END) AS bucket_90_plus
     FROM invoices
     WHERE status = 'sent' AND due_date < ?`,
  ).bind(now, now, now, now, now).all();

  // Revenue split: aggregator vs direct (last 30 days, paid invoices)
  const { results: revSplit } = await c.env.DB.prepare(
    `SELECT cl.type, COALESCE(SUM(i.total), 0) AS total
     FROM invoices i
     JOIN clients cl ON cl.id = i.client_id
     WHERE i.status = 'paid' AND i.paid_at >= ?
     GROUP BY cl.type`,
  ).bind(thirtyDaysAgo).all<{ type: string; total: number }>();

  // Monthly net income trend (last 6 months, grouped by calendar month)
  const { results: monthlyTrend } = await c.env.DB.prepare(
    `SELECT
       STRFTIME('%Y-%m', DATETIME(paid_at / 1000, 'unixepoch')) AS month,
       COALESCE(SUM(total), 0) AS revenue
     FROM invoices
     WHERE status = 'paid' AND paid_at >= ?
     GROUP BY month
     ORDER BY month ASC`,
  ).bind(now - 6 * 30 * 24 * 60 * 60 * 1000).all();

  // Overdue invoices count + total outstanding
  const outstanding = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
     FROM invoices WHERE status = 'sent' AND due_date < ?`,
  ).bind(now).first<{ count: number; total: number }>();

  // Previous 30 days MRR for growth calc
  const prevMrr = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(total), 0) AS mrr FROM invoices
     WHERE status = 'paid' AND paid_at >= ? AND paid_at < ?`,
  ).bind(sixtyDaysAgo, thirtyDaysAgo).first<{ mrr: number }>();

  const currentMrr = mrr?.mrr ?? 0;
  const previousMrr = prevMrr?.mrr ?? 0;
  const mrrGrowthPct = previousMrr > 0
    ? Math.round(((currentMrr - previousMrr) / previousMrr) * 100)
    : null;

  return ok(c, {
    mrr: currentMrr,
    mrr_growth_pct: mrrGrowthPct,
    ar_aging: agingRows?.[0] ?? { bucket_0_30: 0, bucket_31_60: 0, bucket_61_90: 0, bucket_90_plus: 0 },
    revenue_split: {
      aggregator: revSplit?.find(r => r.type === "aggregator")?.total ?? 0,
      direct: revSplit?.find(r => r.type === "direct")?.total ?? 0,
    },
    monthly_trend: monthlyTrend ?? [],
    outstanding_invoices: outstanding ?? { count: 0, total: 0 },
  });
});

// ─── GET /admin/domain-health ─────────────────────────────────────────────────

admin.get("/domain-health", async (c) => {
  const { results: domains } = await c.env.DB.prepare(
    `SELECT sd.id, sd.tenant_id, t.name AS tenant_name, sd.domain,
            sd.reputation_score, sd.bounce_rate, sd.spam_rate,
            sd.is_active, sd.is_warming, sd.daily_send_count,
            sd.daily_send_limit, sd.spf_valid, sd.dkim_valid,
            sd.dmarc_valid, sd.last_health_check
     FROM sending_domains sd
     JOIN tenants t ON t.id = sd.tenant_id
     ORDER BY sd.spam_rate DESC NULLS LAST, sd.reputation_score ASC NULLS LAST`,
  ).all();

  // Annotate with traffic-light health status
  const annotated = (domains ?? []).map((d: Record<string, unknown>) => ({
    ...d,
    health_status: computeHealthStatus(
      d.spam_rate as number | null,
      d.bounce_rate as number | null,
      d.reputation_score as number | null,
      Boolean(d.is_active),
    ),
  }));

  return ok(c, annotated);
});

function computeHealthStatus(
  spamRate: number | null,
  bounceRate: number | null,
  reputationScore: number | null,
  isActive: boolean,
): "green" | "amber" | "red" {
  if (!isActive) return "red";
  if (spamRate !== null && spamRate > 0.02) return "red";
  if (bounceRate !== null && bounceRate > 0.05) return "red";
  if (reputationScore !== null && reputationScore < 30) return "red";
  if (spamRate !== null && spamRate > 0.01) return "amber";
  if (bounceRate !== null && bounceRate > 0.03) return "amber";
  if (reputationScore !== null && reputationScore < 60) return "amber";
  return "green";
}

// ─── POST /admin/domain-health/:id/suspend ────────────────────────────────────

admin.post("/domain-health/:id/suspend", async (c) => {
  const domainId = c.req.param("id");
  const now = Date.now();

  const domain = await c.env.DB.prepare(
    `SELECT id, tenant_id, domain FROM sending_domains WHERE id = ?`,
  ).bind(domainId).first<{ id: string; tenant_id: string; domain: string }>();

  if (!domain) throw new ApiError(404, "NOT_FOUND", "Domain not found");

  await c.env.DB.prepare(
    `UPDATE sending_domains SET is_active = 0, updated_at = ? WHERE id = ?`,
  ).bind(now, domainId).run();

  return ok(c, { id: domainId, domain: domain.domain, is_active: false });
});

// ─── GET /admin/logs ──────────────────────────────────────────────────────────

admin.get("/logs", async (c) => {
  const { results: logs } = await c.env.DB.prepare(
    `SELECT * FROM ops_queue
     ORDER BY created_at DESC
     LIMIT 500`,
  ).all();

  return ok(c, logs ?? []);
});

export { admin };
