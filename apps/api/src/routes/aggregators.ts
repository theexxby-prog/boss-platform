import { Hono } from "hono";
import { z } from "zod";

import {
  countLeadsForClient,
  createClient,
  getClientById,
  listClients,
  updateClient,
} from "../db/queries/index";
import { created, fail, noContent, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import type { AppVariables, EnvBindings } from "../types";

const createAggregatorSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  contact_name: z.string().min(2),
  price_per_lead: z.number().positive(),
  payout_schedule: z.enum(["monthly", "weekly"]),
});

const updateAggregatorSchema = z.object({
  name: z.string().min(2).optional(),
  price_per_lead: z.number().positive().optional(),
  lead_supply_status: z.enum(["active", "paused"]).optional(),
});

function parseNotes(notes: string | null): Record<string, unknown> {
  if (!notes) return {};
  try {
    return JSON.parse(notes) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const aggregatorsRouter = new Hono<{ Bindings: EnvBindings; Variables: AppVariables }>();
aggregatorsRouter.use("*", requireAuth, requireTenant);

aggregatorsRouter.post("/", async (c) => {
  const parsed = createAggregatorSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid aggregator payload", { issues: parsed.error.issues });
  const tenantId = c.get("tenantId");
  const aggregator = await createClient(c.env.DB, tenantId, {
    name: parsed.data.name,
    type: "aggregator",
    billing_email: parsed.data.email,
    notes: JSON.stringify({
      contact_name: parsed.data.contact_name,
      price_per_lead: parsed.data.price_per_lead,
      payout_schedule: parsed.data.payout_schedule,
      lead_supply_status: "active",
    }),
  });
  return created(c, { aggregator });
});

aggregatorsRouter.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const aggregators = await listClients(c.env.DB, tenantId, "aggregator");
  return ok(c, { aggregators, count: aggregators.length });
});

aggregatorsRouter.get("/:aggregatorId", async (c) => {
  const tenantId = c.get("tenantId");
  const aggregator = await getClientById(c.env.DB, tenantId, c.req.param("aggregatorId"));
  if (!aggregator || aggregator.type !== "aggregator") return fail(c, 404, "NOT_FOUND", "Aggregator not found");
  const leads_supplied = await countLeadsForClient(c.env.DB, tenantId, aggregator.client_id);
  const notes = parseNotes(aggregator.notes);
  const price = Number(notes.price_per_lead ?? 0);
  return ok(c, {
    aggregator,
    leads_supplied,
    revenue_owed: Math.max(0, leads_supplied * price),
  });
});

aggregatorsRouter.put("/:aggregatorId", async (c) => {
  const parsed = updateAggregatorSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid aggregator update payload", { issues: parsed.error.issues });
  const tenantId = c.get("tenantId");
  const existing = await getClientById(c.env.DB, tenantId, c.req.param("aggregatorId"));
  if (!existing || existing.type !== "aggregator") return fail(c, 404, "NOT_FOUND", "Aggregator not found");
  const notes = parseNotes(existing.notes);
  if (parsed.data.price_per_lead !== undefined) notes.price_per_lead = parsed.data.price_per_lead;
  if (parsed.data.lead_supply_status !== undefined) notes.lead_supply_status = parsed.data.lead_supply_status;
  const updated = await updateClient(c.env.DB, tenantId, existing.client_id, {
    name: parsed.data.name,
    notes: JSON.stringify(notes),
  });
  if (!updated) return fail(c, 404, "NOT_FOUND", "Aggregator not found");
  return ok(c, { aggregator: updated });
});

aggregatorsRouter.delete("/:aggregatorId", async (c) => {
  const tenantId = c.get("tenantId");
  const existing = await getClientById(c.env.DB, tenantId, c.req.param("aggregatorId"));
  if (!existing || existing.type !== "aggregator") return fail(c, 404, "NOT_FOUND", "Aggregator not found");
  await updateClient(c.env.DB, tenantId, existing.client_id, { status: "archived" });
  return noContent(c);
});
