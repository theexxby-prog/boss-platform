import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/auth", () => ({
  requireAuth: async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../middleware/tenant", () => ({
  requireTenant: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("tenantId", "tenant-1");
    await next();
  },
}));
vi.mock("../db/queries/index", () => ({
  createOpsQueueEntry: vi.fn().mockResolvedValue("q1"),
  getInvoiceById: vi.fn(),
  listInvoices: vi.fn(),
  updateInvoiceStatus: vi.fn(),
}));

import { getInvoiceById, listInvoices } from "../db/queries/index";
import { invoicesRouter } from "./invoices";

const app = new Hono().basePath("/api/v1");
app.route("/invoices", invoicesRouter);

describe("invoices routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listInvoices).mockResolvedValue([{ invoice_id: "i1", total: 100, status: "draft" }] as never);
    vi.mocked(getInvoiceById).mockResolvedValue({ invoice_id: "i1", line_items: "[]", status: "draft" } as never);
  });

  it("list invoices", async () => {
    const res = await app.request("http://x/api/v1/invoices", { method: "GET" }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });

  it("invoice detail", async () => {
    const res = await app.request("http://x/api/v1/invoices/i1", { method: "GET" }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
});
