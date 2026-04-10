// REF: boss-hq/worker/src/routes/clients.ts — CRUD route organization pattern

import { Hono } from "hono";
import { z } from "zod";

import {
  createClient,
  getClientActiveCampaigns,
  getClientById,
  getClientTotalSpend,
  listClients,
  updateClient,
} from "../db/queries/index";
import { created, fail, noContent, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import type { AppVariables, EnvBindings } from "../types";

const createClientSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  contact_name: z.string().min(2),
  industry: z.string().min(2).optional(),
});

const updateClientSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  contact_name: z.string().min(2).optional(),
  industry: z.string().min(2).optional(),
});

function mergeClientNotes(previous: string | null, patch: Record<string, unknown>): string {
  let parsed: Record<string, unknown> = {};
  if (previous) {
    try {
      parsed = JSON.parse(previous) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  return JSON.stringify({ ...parsed, ...patch });
}

export const clientsRouter = new Hono<{ Bindings: EnvBindings; Variables: AppVariables }>();
clientsRouter.use("*", requireAuth, requireTenant);

clientsRouter.post("/", async (c) => {
  const parsed = createClientSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid client payload", { issues: parsed.error.issues });
  const tenantId = c.get("tenantId");
  const client = await createClient(c.env.DB, tenantId, {
    name: parsed.data.name,
    type: "direct",
    billing_email: parsed.data.email,
    notes: JSON.stringify({
      contact_name: parsed.data.contact_name,
      industry: parsed.data.industry ?? null,
    }),
  });
  return created(c, { client });
});

clientsRouter.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const clients = await listClients(c.env.DB, tenantId, "direct");
  return ok(c, { clients, count: clients.length });
});

clientsRouter.get("/:clientId", async (c) => {
  const tenantId = c.get("tenantId");
  const client = await getClientById(c.env.DB, tenantId, c.req.param("clientId"));
  if (!client || client.type !== "direct") return fail(c, 404, "NOT_FOUND", "Client not found");
  const active_campaigns = await getClientActiveCampaigns(c.env.DB, tenantId, client.client_id);
  const total_spent = await getClientTotalSpend(c.env.DB, tenantId, client.client_id);
  return ok(c, { client, active_campaigns, total_spent });
});

clientsRouter.put("/:clientId", async (c) => {
  const parsed = updateClientSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid client update payload", { issues: parsed.error.issues });
  const tenantId = c.get("tenantId");
  const existing = await getClientById(c.env.DB, tenantId, c.req.param("clientId"));
  if (!existing || existing.type !== "direct") return fail(c, 404, "NOT_FOUND", "Client not found");
  const notesPatch: Record<string, unknown> = {};
  if (parsed.data.contact_name !== undefined) notesPatch.contact_name = parsed.data.contact_name;
  if (parsed.data.industry !== undefined) notesPatch.industry = parsed.data.industry;

  const updated = await updateClient(c.env.DB, tenantId, existing.client_id, {
    name: parsed.data.name,
    billing_email: parsed.data.email,
    notes: Object.keys(notesPatch).length ? mergeClientNotes(existing.notes, notesPatch) : undefined,
  });
  if (!updated) return fail(c, 404, "NOT_FOUND", "Client not found");
  return ok(c, { client: updated });
});

clientsRouter.delete("/:clientId", async (c) => {
  const tenantId = c.get("tenantId");
  const existing = await getClientById(c.env.DB, tenantId, c.req.param("clientId"));
  if (!existing || existing.type !== "direct") return fail(c, 404, "NOT_FOUND", "Client not found");
  await updateClient(c.env.DB, tenantId, existing.client_id, { status: "archived" });
  return noContent(c);
});
