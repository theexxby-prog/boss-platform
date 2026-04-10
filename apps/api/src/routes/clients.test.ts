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
  createClient: vi.fn(),
  getClientActiveCampaigns: vi.fn(),
  getClientById: vi.fn(),
  getClientTotalSpend: vi.fn(),
  listClients: vi.fn(),
  updateClient: vi.fn(),
}));

import { createClient, getClientActiveCampaigns, getClientById, getClientTotalSpend, listClients, updateClient } from "../db/queries/index";
import { clientsRouter } from "./clients";

const app = new Hono().basePath("/api/v1");
app.route("/clients", clientsRouter);

describe("clients routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({ client_id: "cl1", type: "direct" } as never);
    vi.mocked(listClients).mockResolvedValue([{ client_id: "cl1" }] as never);
    vi.mocked(getClientById).mockResolvedValue({ client_id: "cl1", type: "direct", notes: "{}" } as never);
    vi.mocked(getClientActiveCampaigns).mockResolvedValue([{ campaign_id: "c1" }] as never);
    vi.mocked(getClientTotalSpend).mockResolvedValue(1000);
    vi.mocked(updateClient).mockResolvedValue({ client_id: "cl1", type: "direct" } as never);
  });

  it("create", async () => {
    const res = await app.request("http://x/api/v1/clients", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Acme", email: "a@b.com", contact_name: "Ada" }) }, { DB: {} } as never);
    expect(res.status).toBe(201);
  });
  it("list", async () => {
    const res = await app.request("http://x/api/v1/clients", { method: "GET" }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
  it("detail", async () => {
    const res = await app.request("http://x/api/v1/clients/cl1", { method: "GET" }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
  it("update", async () => {
    const res = await app.request("http://x/api/v1/clients/cl1", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "New" }) }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
  it("delete", async () => {
    const res = await app.request("http://x/api/v1/clients/cl1", { method: "DELETE" }, { DB: {} } as never);
    expect(res.status).toBe(204);
  });
});
