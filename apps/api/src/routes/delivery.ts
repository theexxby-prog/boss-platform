// REF: boss-hq/worker/src/routes/deliveries.ts — delivery batch route flow and signed download handling

import { Hono } from "hono";
import { z } from "zod";

import {
  getCampaignById,
  getDeliveryBatchById,
  getLeadsByIds,
  listDeliveryBatches,
  updateDeliveryBatch,
} from "../db/queries/index";
import { created, fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import { createDeliveryBatch } from "../services/delivery";
import type { AppVariables, EnvBindings } from "../types";

const createBatchSchema = z.object({
  campaign_id: z.string().min(1),
  lead_ids: z.array(z.string().min(1)).min(1).max(500),
});

const updateStatusSchema = z.object({
  status: z.enum(["sent", "failed"]),
});

async function makeSignedUrl(r2: EnvBindings["R2"], key: string): Promise<string> {
  const candidate = r2 as unknown as {
    createPresignedUrl?: (path: string, options?: { expiresIn?: number; method?: string }) => Promise<string | URL>;
  };
  if (candidate.createPresignedUrl) {
    const signed = await candidate.createPresignedUrl(key, { expiresIn: 60 * 60 * 24, method: "GET" });
    return typeof signed === "string" ? signed : signed.toString();
  }
  return `https://r2.local/${encodeURIComponent(key)}?ttl=86400`;
}

export const deliveryRouter = new Hono<{ Bindings: EnvBindings; Variables: AppVariables }>();
deliveryRouter.use("*", requireAuth, requireTenant);

deliveryRouter.post("/batch", async (c) => {
  const parsed = createBatchSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid delivery payload", { issues: parsed.error.issues });
  const tenantId = c.get("tenantId");
  const campaign = await getCampaignById(c.env.DB, tenantId, parsed.data.campaign_id);
  if (!campaign) return fail(c, 404, "NOT_FOUND", "Campaign not found");

  const leads = await getLeadsByIds(c.env.DB, tenantId, parsed.data.lead_ids);
  if (leads.length !== parsed.data.lead_ids.length) return fail(c, 400, "VALIDATION_ERROR", "One or more lead_ids are invalid");
  if (leads.some((lead) => lead.campaign_id !== parsed.data.campaign_id)) {
    return fail(c, 400, "VALIDATION_ERROR", "All leads must belong to the campaign");
  }

  const batch = await createDeliveryBatch(parsed.data.campaign_id, tenantId, leads, {
    db: c.env.DB,
    r2: c.env.R2,
  });
  return c.json({ data: batch }, 202);
});

deliveryRouter.get("/batches", async (c) => {
  const tenantId = c.get("tenantId");
  const batches = await listDeliveryBatches(c.env.DB, tenantId, {
    campaign_id: c.req.query("campaign_id"),
    status: c.req.query("status"),
  });
  return ok(c, { batches });
});

deliveryRouter.get("/batch/:batchId", async (c) => {
  const tenantId = c.get("tenantId");
  const batch = await getDeliveryBatchById(c.env.DB, tenantId, c.req.param("batchId"));
  if (!batch) return fail(c, 404, "NOT_FOUND", "Batch not found");
  const object = await c.env.R2.head(batch.r2_key);
  const download_url = await makeSignedUrl(c.env.R2, batch.r2_key);
  return ok(c, {
    batch,
    file_size_bytes: object?.size ?? 0,
    download_url,
  });
});

deliveryRouter.put("/batch/:batchId/status", async (c) => {
  const parsed = updateStatusSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid status payload", { issues: parsed.error.issues });
  const tenantId = c.get("tenantId");
  const updated = await updateDeliveryBatch(c.env.DB, tenantId, c.req.param("batchId"), {
    delivery_status: parsed.data.status,
  });
  if (!updated) return fail(c, 404, "NOT_FOUND", "Batch not found");
  return ok(c, { batch: updated });
});
