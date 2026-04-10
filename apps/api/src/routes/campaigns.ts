// REF: boss-hq/worker/src/routes/campaigns.ts — CRUD route shape and status-driven stats pattern

import { Hono } from "hono";
import { z } from "zod";

import {
  createCampaign,
  getCampaignById,
  getCampaignDistributionStats,
  getCampaignLeadStats,
  getCampaignLeadsFiltered,
  listCampaigns,
  updateCampaign,
} from "../db/queries/index";
import { fail, noContent, ok, created } from "../http";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import type { AppVariables, EnvBindings } from "../types";

const createCampaignSchema = z.object({
  client_id: z.string().min(1),
  icp_profile_id: z.string().min(1),
  name: z.string().min(2),
  tier: z.enum(["mql", "custom-q", "bant", "bant+appt"]),
  ordered_count: z.number().int().positive(),
  cpl: z.number().positive(),
  min_review_score: z.number().int().min(0).max(100).optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().min(2).optional(),
  tier: z.enum(["mql", "custom-q", "bant", "bant+appt"]).optional(),
  status: z.string().min(3).optional(),
  min_review_score: z.number().int().min(0).max(100).optional(),
});

function mapTier(input: "mql" | "custom-q" | "bant" | "bant+appt"): "mql" | "custom_q" | "bant" | "bant_appt" {
  if (input === "custom-q") return "custom_q";
  if (input === "bant+appt") return "bant_appt";
  return input;
}

export const campaignsRouter = new Hono<{ Bindings: EnvBindings; Variables: AppVariables }>();
campaignsRouter.use("*", requireAuth, requireTenant);

campaignsRouter.post("/", async (c) => {
  const parsed = createCampaignSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid campaign payload", { issues: parsed.error.issues });

  const tenantId = c.get("tenantId");
  const campaign = await createCampaign(c.env.DB, tenantId, {
    client_id: parsed.data.client_id,
    icp_profile_id: parsed.data.icp_profile_id,
    name: parsed.data.name,
    product_tier: mapTier(parsed.data.tier),
    leads_ordered: parsed.data.ordered_count,
    cpl: parsed.data.cpl,
    min_review_score: parsed.data.min_review_score,
  });
  return created(c, { campaign });
});

campaignsRouter.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const tier = c.req.query("tier") as "mql" | "custom-q" | "bant" | "bant+appt" | undefined;
  const campaigns = await listCampaigns(c.env.DB, tenantId, {
    status: c.req.query("status"),
    tier: tier ? mapTier(tier) : undefined,
  });
  return ok(c, { campaigns, count: campaigns.length });
});

campaignsRouter.get("/:campaignId", async (c) => {
  const tenantId = c.get("tenantId");
  const campaign = await getCampaignById(c.env.DB, tenantId, c.req.param("campaignId"));
  if (!campaign) return fail(c, 404, "NOT_FOUND", "Campaign not found");
  const stats = await getCampaignLeadStats(c.env.DB, tenantId, campaign.campaign_id);
  return ok(c, { campaign, stats });
});

campaignsRouter.put("/:campaignId", async (c) => {
  const parsed = updateCampaignSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid campaign update payload", { issues: parsed.error.issues });
  const tenantId = c.get("tenantId");
  const campaign = await updateCampaign(c.env.DB, tenantId, c.req.param("campaignId"), {
    name: parsed.data.name,
    product_tier: parsed.data.tier ? mapTier(parsed.data.tier) : undefined,
    status: parsed.data.status,
  });
  if (!campaign) return fail(c, 404, "NOT_FOUND", "Campaign not found");
  return ok(c, { campaign });
});

campaignsRouter.delete("/:campaignId", async (c) => {
  const tenantId = c.get("tenantId");
  const updated = await updateCampaign(c.env.DB, tenantId, c.req.param("campaignId"), { status: "archived" });
  if (!updated) return fail(c, 404, "NOT_FOUND", "Campaign not found");
  return noContent(c);
});

campaignsRouter.get("/:campaignId/leads", async (c) => {
  const tenantId = c.get("tenantId");
  const campaignId = c.req.param("campaignId");
  const campaign = await getCampaignById(c.env.DB, tenantId, campaignId);
  if (!campaign) return fail(c, 404, "NOT_FOUND", "Campaign not found");
  const leads = await getCampaignLeadsFiltered(c.env.DB, tenantId, campaignId, {
    status: c.req.query("status"),
    score_min: c.req.query("score_min") ? Number(c.req.query("score_min")) : undefined,
    score_max: c.req.query("score_max") ? Number(c.req.query("score_max")) : undefined,
    country: c.req.query("country"),
  });
  return ok(c, { leads, count: leads.length });
});

campaignsRouter.get("/:campaignId/stats", async (c) => {
  const tenantId = c.get("tenantId");
  const campaign = await getCampaignById(c.env.DB, tenantId, c.req.param("campaignId"));
  if (!campaign) return fail(c, 404, "NOT_FOUND", "Campaign not found");
  const stats = await getCampaignDistributionStats(c.env.DB, tenantId, campaign.campaign_id);
  return ok(c, stats);
});
