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
  getCampaignById: vi.fn(),
  getDeliveryBatchById: vi.fn(),
  getLeadsByIds: vi.fn(),
  listDeliveryBatches: vi.fn(),
  updateDeliveryBatch: vi.fn(),
}));
vi.mock("../services/delivery", () => ({
  createDeliveryBatch: vi.fn(),
}));

import { getCampaignById, getLeadsByIds, listDeliveryBatches } from "../db/queries/index";
import { createDeliveryBatch } from "../services/delivery";
import { deliveryRouter } from "./delivery";

const app = new Hono().basePath("/api/v1");
app.route("/delivery", deliveryRouter);

describe("delivery routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCampaignById).mockResolvedValue({ campaign_id: "c1" } as never);
    vi.mocked(getLeadsByIds).mockResolvedValue([{ lead_id: "l1", campaign_id: "c1" }] as never);
    vi.mocked(createDeliveryBatch).mockResolvedValue({ batch_id: "b1", file_url: "https://x", delivery_status: "pending" } as never);
    vi.mocked(listDeliveryBatches).mockResolvedValue([{ batch_id: "b1" }] as never);
  });

  it("create batch", async () => {
    const res = await app.request("http://x/api/v1/delivery/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaign_id: "c1", lead_ids: ["l1"] }) }, { DB: {}, R2: {} } as never);
    expect(res.status).toBe(202);
  });
  it("list batches", async () => {
    const res = await app.request("http://x/api/v1/delivery/batches", { method: "GET" }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
});
