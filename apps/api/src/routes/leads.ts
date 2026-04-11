// REF: boss-hq/worker/src/routes/sourcing.ts — payload validation first, then side effects
// REF: boss-hq/worker/src/routes/leads.ts — route branching pattern

import { Hono } from "hono";
import { z } from "zod";
import { createLead, getCampaignById, getLeadById, getLeadsByCampaign } from "../db/queries/index";
import { fail, ok, ApiError } from "../http";
import { requireAuth, sha256Hex } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import type { AppVariables, EnvBindings } from "../types";

const rawLeadSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  company_domain: z.string().optional(),
  linkedin_url: z.string().url().optional(),
});

const ingestSchema = z.object({
  campaign_id: z.string().min(1),
  leads: z.array(rawLeadSchema).min(1).max(500),
});

export const leadsRouter = new Hono<{ Bindings: EnvBindings; Variables: AppVariables }>();
leadsRouter.use("*", requireAuth, requireTenant);

// ─── Shared ingest logic ──────────────────────────────────────────────────────

async function handleIngest(c: { req: { json: () => Promise<unknown> }; env: EnvBindings; get: (k: string) => string; json: (b: unknown, s: number) => Response }) {
  const parsed = ingestSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return fail(c as never, 400, "VALIDATION_ERROR", "Invalid payload", { issues: parsed.error.issues });
  }

  const tenantId = c.get("tenantId");
  const campaign = await getCampaignById(c.env.DB, tenantId, parsed.data.campaign_id);
  if (!campaign) return fail(c as never, 404, "CAMPAIGN_NOT_FOUND", "Campaign not found");

  let queued = 0; let duplicate = 0;

  for (const lead of parsed.data.leads) {
    const dedupHash = await sha256Hex(`${lead.email.toLowerCase()}|${tenantId}`);
    const exists = await c.env.DB.prepare(
      `SELECT id FROM leads WHERE dedup_hash = ? AND tenant_id = ? LIMIT 1`
    ).bind(dedupHash, tenantId).first();

    if (exists) { duplicate++; continue; }

    const created = await createLead(c.env.DB, tenantId, {
      campaign_id: campaign.campaign_id,
      first_name: lead.first_name ?? null, last_name: lead.last_name ?? null,
      email: lead.email.toLowerCase(), phone: lead.phone ?? null,
      title: lead.title ?? null, company: lead.company ?? null,
      company_domain: lead.company_domain ?? null, linkedin_url: lead.linkedin_url ?? null,
      industry: null, company_size: null, country: null, state: null, seniority: null,
      tech_stack: "[]", email_status: null, email_score: null,
      icp_score: null, icp_score_breakdown: null, icp_reasons: "[]", custom_answers: "[]",
      bant_budget: null, bant_authority: null, bant_need: null, bant_timeline: null,
      bant_score: null, bant_confidence: null, bant_notes: null,
      appt_scheduled_at: null, appt_calendar_link: null, appt_status: null,
      status: "ingested", rejection_reason: null, ops_reviewer_id: null,
      delivered_at: null, delivery_batch_id: null, client_rejected: 0,
      client_rejected_reason: null, client_rejected_at: null, replacement_lead_id: null,
      dedup_hash: dedupHash, source_domain: lead.company_domain ?? null,
    });

    const queue = c.env.QUEUE ?? c.env.LEAD_QUEUE;
    await queue.send({ lead_id: created.lead_id, campaign_id: campaign.campaign_id, tenant_id: tenantId, retry_count: 0 });
    queued++;
  }

  return c.json({ data: { processed: parsed.data.leads.length, queued, duplicate } }, 202);
}

// POST /leads  +  POST /leads/ingest (n8n alias)
leadsRouter.post("/", async (c) => { try { return await handleIngest(c as never); } catch (e) { return fail(c, 500, "INTERNAL_SERVER_ERROR", String(e)); } });
leadsRouter.post("/ingest", async (c) => { try { return await handleIngest(c as never); } catch (e) { return fail(c, 500, "INTERNAL_SERVER_ERROR", String(e)); } });

// GET /leads/ops-queue
leadsRouter.get("/ops-queue", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT oq.*, l.email, l.first_name, l.last_name, l.company FROM ops_queue oq
       LEFT JOIN leads l ON l.id = oq.lead_id
       WHERE oq.tenant_id = ? AND oq.status = 'open'
       ORDER BY oq.priority DESC, oq.sla_deadline ASC LIMIT 100`
    ).bind(c.get("tenantId")).all();
    return ok(c, results ?? []);
  } catch (e) { return fail(c, 500, "INTERNAL_SERVER_ERROR", String(e)); }
});

// PUT /leads/ops-queue/:itemId
leadsRouter.put("/ops-queue/:itemId", async (c) => {
  try {
    const tenantId = c.get("tenantId");
    const itemId = c.req.param("itemId");
    const body = await c.req.json<{ status?: string; resolution?: string }>().catch(() => ({ status: undefined, resolution: undefined }));
    const now = Date.now();
    const newStatus = body.status ?? "closed";
    const r = await c.env.DB.prepare(
      `UPDATE ops_queue SET status=?, resolution=?, resolved_at=?, updated_at=? WHERE id=? AND tenant_id=?`
    ).bind(newStatus, body.resolution ?? null, newStatus === "closed" ? now : null, now, itemId, tenantId).run();
    if (!r.meta.changes) throw new ApiError(404, "NOT_FOUND", "Queue item not found");
    const item = await c.env.DB.prepare(`SELECT * FROM ops_queue WHERE id=? AND tenant_id=?`).bind(itemId, tenantId).first();
    return ok(c, item);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    return fail(c, 500, "INTERNAL_SERVER_ERROR", String(e));
  }
});

// GET /leads/:leadId
leadsRouter.get("/:leadId", async (c) => {
  try {
    const lead = await getLeadById(c.env.DB, c.get("tenantId"), c.req.param("leadId"));
    if (!lead) return fail(c, 404, "NOT_FOUND", "Lead not found");
    return ok(c, lead);
  } catch (e) { return fail(c, 500, "INTERNAL_SERVER_ERROR", String(e)); }
});

// POST /leads/:leadId/reject
leadsRouter.post("/:leadId/reject", async (c) => {
  try {
    const tenantId = c.get("tenantId");
    const leadId = c.req.param("leadId");
    const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
    const now = Date.now();
    const r = await c.env.DB.prepare(
      `UPDATE leads SET client_rejected=1, client_rejected_reason=?, client_rejected_at=?, status='rejected', updated_at=? WHERE id=? AND tenant_id=?`
    ).bind(reason ?? null, now, now, leadId, tenantId).run();
    if (!r.meta.changes) return fail(c, 404, "NOT_FOUND", "Lead not found");
    return ok(c, await getLeadById(c.env.DB, tenantId, leadId));
  } catch (e) { return fail(c, 500, "INTERNAL_SERVER_ERROR", String(e)); }
});

// GET /leads
leadsRouter.get("/", async (c) => {
  try {
    const tenantId = c.get("tenantId");
    const campaignId = c.req.query("campaign_id");
    const status = c.req.query("status");
    if (!campaignId) return fail(c, 400, "VALIDATION_ERROR", "campaign_id is required");
    const rows = await getLeadsByCampaign(c.env.DB, tenantId, campaignId, status);
    return ok(c, rows);
  } catch (e) { return fail(c, 500, "INTERNAL_SERVER_ERROR", String(e)); }
});
