// REF: boss-hq/worker/src/routes/billing.ts — status-transition validation and summary response pattern

import { Hono } from "hono";
import { z } from "zod";

import {
  createOpsQueueEntry,
  getInvoiceById,
  listInvoices,
  updateInvoiceStatus,
} from "../db/queries/index";
import { created, fail, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import type { AppVariables, EnvBindings } from "../types";

const updateStatusSchema = z.object({
  status: z.enum(["paid", "overdue"]),
});

const chaseSchema = z.object({
  notes: z.string().min(3),
});

export const invoicesRouter = new Hono<{ Bindings: EnvBindings; Variables: AppVariables }>();
invoicesRouter.use("*", requireAuth, requireTenant);

invoicesRouter.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const start = c.req.query("start_date");
  const end = c.req.query("end_date");
  const invoices = await listInvoices(c.env.DB, tenantId, {
    client_id: c.req.query("client_id"),
    status: c.req.query("status"),
    start_date: start ? Number(start) : undefined,
    end_date: end ? Number(end) : undefined,
  });
  const total_ar = invoices
    .filter((invoice) => invoice.status !== "paid")
    .reduce((acc, invoice) => acc + invoice.total, 0);
  return ok(c, { invoices, total_ar });
});

invoicesRouter.get("/:invoiceId", async (c) => {
  const tenantId = c.get("tenantId");
  const invoice = await getInvoiceById(c.env.DB, tenantId, c.req.param("invoiceId"));
  if (!invoice) return fail(c, 404, "NOT_FOUND", "Invoice not found");
  let line_items: unknown[] = [];
  try {
    line_items = JSON.parse(invoice.line_items) as unknown[];
  } catch {
    line_items = [];
  }
  return ok(c, { invoice, line_items });
});

invoicesRouter.put("/:invoiceId/status", async (c) => {
  const parsed = updateStatusSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid invoice status payload", { issues: parsed.error.issues });
  const tenantId = c.get("tenantId");
  const current = await getInvoiceById(c.env.DB, tenantId, c.req.param("invoiceId"));
  if (!current) return fail(c, 404, "NOT_FOUND", "Invoice not found");
  if (current.status === "paid" && parsed.data.status === "overdue") {
    return fail(c, 400, "INVALID_TRANSITION", "Cannot transition paid invoice to overdue");
  }
  const updated = await updateInvoiceStatus(c.env.DB, tenantId, current.invoice_id, parsed.data.status);
  if (!updated) return fail(c, 404, "NOT_FOUND", "Invoice not found");
  return ok(c, { invoice: updated });
});

invoicesRouter.post("/:invoiceId/send", async (c) => {
  const tenantId = c.get("tenantId");
  const invoice = await getInvoiceById(c.env.DB, tenantId, c.req.param("invoiceId"));
  if (!invoice) return fail(c, 404, "NOT_FOUND", "Invoice not found");
  await updateInvoiceStatus(c.env.DB, tenantId, invoice.invoice_id, "sent");
  return c.json({ data: { sent: true, sent_at: Date.now() } }, 202);
});

invoicesRouter.post("/:invoiceId/chase", async (c) => {
  const parsed = chaseSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid chase payload", { issues: parsed.error.issues });
  const tenantId = c.get("tenantId");
  const invoice = await getInvoiceById(c.env.DB, tenantId, c.req.param("invoiceId"));
  if (!invoice) return fail(c, 404, "NOT_FOUND", "Invoice not found");
  const chase_id = await createOpsQueueEntry(c.env.DB, tenantId, {
    lead_id: null,
    task_type: "ar_chase",
    priority: "high",
    description: `Invoice ${invoice.invoice_id}: ${parsed.data.notes}`,
    assigned_to: null,
    status: "open",
    resolution: null,
    resolved_at: null,
    sla_deadline: Date.now() + 24 * 60 * 60 * 1000,
    updated_at: Date.now(),
  });
  return created(c, { chase_id, created_at: Date.now() });
});
