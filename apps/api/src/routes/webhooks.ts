// REF: boss-hq/worker/src/routes/webhooks.ts — HMAC signature check + always-acknowledge semantics
// REF: boss-hq/worker/src/services/integrationService.ts — typed integration error style

import { Hono } from "hono";
import { z } from "zod";

import {
  createOpsQueueEntry,
  findLeadByEmail,
  getDeliveryBatchById,
  updateDeliveryBatch,
  updateLeadStatusText,
} from "../db/queries/index";
import { fail } from "../http";
import type { AppVariables, EnvBindings } from "../types";

const instantlySchema = z.object({
  event: z.enum(["opened", "clicked", "replied"]),
  email: z.string().email(),
  timestamp: z.number(),
});

const hubspotSchema = z.object({
  event: z.enum(["deal_created", "deal_won"]),
  email: z.string().email(),
  data: z.record(z.string(), z.unknown()).default({}),
});

const deliveryStatusSchema = z.object({
  batch_id: z.string().min(1),
  status: z.enum(["sent", "failed"]),
  error: z.string().optional(),
});

function textEncoder(input: string): ArrayBuffer {
  return new TextEncoder().encode(input).buffer as ArrayBuffer;
}

async function verifySignature(secret: string, payload: string, signature: string | undefined): Promise<boolean> {
  if (!signature) return false;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    textEncoder(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedBuffer = await crypto.subtle.sign("HMAC", cryptoKey, textEncoder(payload));
  const expectedHex = Array.from(new Uint8Array(expectedBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return expectedHex === signature;
}

async function logWebhook(kv: EnvBindings["KV"], type: string, payload: unknown): Promise<void> {
  await kv.put(`system_logs:webhook:${type}:${Date.now()}:${crypto.randomUUID()}`, JSON.stringify(payload), {
    expirationTtl: 14 * 24 * 60 * 60,
  });
}

export const webhooksRouter = new Hono<{ Bindings: EnvBindings; Variables: AppVariables }>();

webhooksRouter.post("/instantly", async (c) => {
  const payload = await c.req.text();
  const signature = c.req.header("x-boss-signature");
  const secret = c.env.JWT_SECRET;
  const verified = await verifySignature(secret, payload, signature);
  if (!verified) return fail(c, 401, "INVALID_SIGNATURE", "Webhook signature invalid");
  const parsed = instantlySchema.safeParse(JSON.parse(payload));
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid webhook payload", { issues: parsed.error.issues });

  const tenantId = c.req.header("x-tenant-id");
  if (!tenantId) return fail(c, 400, "VALIDATION_ERROR", "x-tenant-id header is required");

  const lead = await findLeadByEmail(c.env.DB, tenantId, parsed.data.email);
  if (lead && parsed.data.event === "replied") {
    await updateLeadStatusText(c.env.DB, tenantId, lead.lead_id, "responding");
    await createOpsQueueEntry(c.env.DB, tenantId, {
      lead_id: lead.lead_id,
      task_type: "reply_followup",
      priority: "high",
      description: `Lead replied via Instantly (${parsed.data.email})`,
      assigned_to: null,
      status: "open",
      resolution: null,
      resolved_at: null,
      sla_deadline: Date.now() + 4 * 60 * 60 * 1000,
      updated_at: Date.now(),
    });
  }

  await logWebhook(c.env.KV, "instantly", parsed.data);
  return c.json({ data: { accepted: true } }, 202);
});

webhooksRouter.post("/hubspot", async (c) => {
  const payload = await c.req.text();
  const signature = c.req.header("x-boss-signature");
  const secret = c.env.JWT_SECRET;
  const verified = await verifySignature(secret, payload, signature);
  if (!verified) return fail(c, 401, "INVALID_SIGNATURE", "Webhook signature invalid");
  const parsed = hubspotSchema.safeParse(JSON.parse(payload));
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid webhook payload", { issues: parsed.error.issues });

  const tenantId = c.req.header("x-tenant-id");
  if (!tenantId) return fail(c, 400, "VALIDATION_ERROR", "x-tenant-id header is required");

  const lead = await findLeadByEmail(c.env.DB, tenantId, parsed.data.email);
  if (lead && parsed.data.event === "deal_won") {
    await updateLeadStatusText(c.env.DB, tenantId, lead.lead_id, "won");
  }
  await logWebhook(c.env.KV, "hubspot", parsed.data);
  return c.json({ data: { accepted: true } }, 202);
});

webhooksRouter.post("/delivery-status", async (c) => {
  const payload = await c.req.text();
  const signature = c.req.header("x-boss-signature");
  const secret = c.env.JWT_SECRET;
  const verified = await verifySignature(secret, payload, signature);
  if (!verified) return fail(c, 401, "INVALID_SIGNATURE", "Webhook signature invalid");
  const parsed = deliveryStatusSchema.safeParse(JSON.parse(payload));
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid webhook payload", { issues: parsed.error.issues });

  const tenantId = c.req.header("x-tenant-id");
  if (!tenantId) return fail(c, 400, "VALIDATION_ERROR", "x-tenant-id header is required");

  const batch = await getDeliveryBatchById(c.env.DB, tenantId, parsed.data.batch_id);
  if (!batch) return fail(c, 404, "NOT_FOUND", "Batch not found");
  await updateDeliveryBatch(c.env.DB, tenantId, batch.batch_id, { delivery_status: parsed.data.status });
  if (parsed.data.status === "failed") {
    await createOpsQueueEntry(c.env.DB, tenantId, {
      lead_id: null,
      task_type: "delivery_status_failure",
      priority: "high",
      description: parsed.data.error ?? "Delivery provider reported failure",
      assigned_to: null,
      status: "open",
      resolution: null,
      resolved_at: null,
      sla_deadline: Date.now() + 4 * 60 * 60 * 1000,
      updated_at: Date.now(),
    });
  }
  await logWebhook(c.env.KV, "delivery-status", parsed.data);
  return c.json({ data: { accepted: true } }, 202);
});
