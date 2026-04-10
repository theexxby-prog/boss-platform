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
  countLeadsForClient: vi.fn(),
  createClient: vi.fn(),
  getClientById: vi.fn(),
  listClients: vi.fn(),
  updateClient: vi.fn(),
}));

import { countLeadsForClient, createClient, getClientById, listClients, updateClient } from "../db/queries/index";
import { aggregatorsRouter } from "./aggregators";

const app = new Hono().basePath("/api/v1");
app.route("/aggregators", aggregatorsRouter);

describe("aggregators routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({ client_id: "ag1", type: "aggregator", notes: "{}" } as never);
    vi.mocked(listClients).mockResolvedValue([{ client_id: "ag1" }] as never);
    vi.mocked(getClientById).mockResolvedValue({ client_id: "ag1", type: "aggregator", notes: JSON.stringify({ price_per_lead: 2 }) } as never);
    vi.mocked(countLeadsForClient).mockResolvedValue(10);
    vi.mocked(updateClient).mockResolvedValue({ client_id: "ag1", type: "aggregator" } as never);
  });

  it("create", async () => {
    const res = await app.request("http://x/api/v1/aggregators", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Ag One", email: "a@b.com", contact_name: "Ada", price_per_lead: 2, payout_schedule: "monthly" }) }, { DB: {} } as never);
    expect(res.status).toBe(201);
  });
  it("list", async () => {
    const res = await app.request("http://x/api/v1/aggregators", { method: "GET" }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
  it("detail", async () => {
    const res = await app.request("http://x/api/v1/aggregators/ag1", { method: "GET" }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
  it("update", async () => {
    const res = await app.request("http://x/api/v1/aggregators/ag1", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Ag Updated", price_per_lead: 3 }) }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
  it("delete", async () => {
    const res = await app.request("http://x/api/v1/aggregators/ag1", { method: "DELETE" }, { DB: {} } as never);
    expect(res.status).toBe(204);
  });
});
