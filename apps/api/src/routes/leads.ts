// REF: boss-hq/worker/src/routes/sourcing.ts — payload validation first, then side effects
// REF: boss-hq/worker/src/routes/leads.ts — route branching pattern for GET list/detail and POST ingest

import { Hono } from "hono";
import { z } from "zod";

import {
  createLead,
  getCampaignById,
  getLeadById,
  getLeadsByCampaign,
} from "../db/queries/index";
import { fail, ok } from "../http";
import { requireAuth, sha256Hex } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import type { AppVariables, EnvBindings } from "../types";

const emailSchema = z.string().email();

const rawLeadSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  email: emailSchema,
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

leadsRouter.post("/", async (c) => {
  try {
    const parsed = ingestSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return fail(c, 400, "VALIDATION_ERROR", "Invalid leads payload", { issues: parsed.error.issues });
    }

    const tenantId = c.get("tenantId");
    const campaign = await getCampaignById(c.env.DB, tenantId, parsed.data.campaign_id);
    if (!campaign) {
      return fail(c, 404, "CAMPAIGN_NOT_FOUND", "Campaign not found for tenant");
    }

    let queued = 0;
    for (const lead of parsed.data.leads) {
      const dedupHash = await sha256Hex(`${lead.email.toLowerCase()}|${tenantId}`);
      const createdLead = await createLead(c.env.DB, tenantId, {
        campaign_id: campaign.campaign_id,
        first_name: lead.first_name ?? null,
        last_name: lead.last_name ?? null,
        email: lead.email.toLowerCase(),
        phone: lead.phone ?? null,
        title: lead.title ?? null,
        company: lead.company ?? null,
        company_domain: lead.company_domain ?? null,
        linkedin_url: lead.linkedin_url ?? null,
        industry: null,
        company_size: null,
        country: null,
        state: null,
        seniority: null,
        tech_stack: "[]",
        email_status: null,
        email_score: null,
        icp_score: null,
        icp_score_breakdown: null,
        icp_reasons: "[]",
        custom_answers: "[]",
        bant_budget: null,
        bant_authority: null,
        bant_need: null,
        bant_timeline: null,
        bant_score: null,
        bant_confidence: null,
        bant_notes: null,
        appt_scheduled_at: null,
        appt_calendar_link: null,
        appt_status: null,
        status: "ingested",
        rejection_reason: null,
        ops_reviewer_id: null,
        delivered_at: null,
        delivery_batch_id: null,
        client_rejected: 0,
        client_rejected_reason: null,
        client_rejected_at: null,
        replacement_lead_id: null,
        dedup_hash: dedupHash,
        source_domain: lead.company_domain ?? null,
      });

      const queue = c.env.QUEUE ?? c.env.LEAD_QUEUE;
      await queue.send({
        lead_id: createdLead.lead_id,
        campaign_id: campaign.campaign_id,
        tenant_id: tenantId,
        retry_count: 0,
      });
      queued += 1;
    }

    return c.json({ data: { processed: parsed.data.leads.length, queued } }, 202);
  } catch (error) {
    return fail(c, 500, "INTERNAL_SERVER_ERROR", "Failed to ingest leads", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

leadsRouter.get("/", async (c) => {
  try {
    const tenantId = c.get("tenantId");
    const campaignId = c.req.query("campaign_id");
    const status = c.req.query("status");
    if (!campaignId) return fail(c, 400, "VALIDATION_ERROR", "campaign_id is required");

    const rows = await getLeadsByCampaign(c.env.DB, tenantId, campaignId, status);
    return ok(c, { leads: rows, count: rows.length });
  } catch (error) {
    return fail(c, 500, "INTERNAL_SERVER_ERROR", "Failed to list leads", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

leadsRouter.get("/:leadId", async (c) => {
  try {
    const tenantId = c.get("tenantId");
    const lead = await getLeadById(c.env.DB, tenantId, c.req.param("leadId"));
    if (!lead) return fail(c, 404, "NOT_FOUND", "Lead not found");
    return ok(c, { lead });
  } catch (error) {
    return fail(c, 500, "INTERNAL_SERVER_ERROR", "Failed to fetch lead", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
