import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middleware/auth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("auth", { tenantId: "tenant-1" });
    await next();
  },
}));
vi.mock("../middleware/tenant", () => ({
  requireTenant: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("tenantId", "tenant-1");
    await next();
  },
}));
vi.mock("../db/queries/index", () => ({
  createCampaign: vi.fn(),
  getCampaignById: vi.fn(),
  getCampaignDistributionStats: vi.fn(),
  getCampaignLeadStats: vi.fn(),
  getCampaignLeadsFiltered: vi.fn(),
  listCampaigns: vi.fn(),
  updateCampaign: vi.fn(),
}));

import {
  createCampaign,
  getCampaignById,
  getCampaignDistributionStats,
  getCampaignLeadStats,
  getCampaignLeadsFiltered,
  listCampaigns,
  updateCampaign,
} from "../db/queries/index";
import { campaignsRouter } from "./campaigns";

const app = new Hono().basePath("/api/v1");
app.route("/campaigns", campaignsRouter);

describe("campaigns routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCampaign).mockResolvedValue({ campaign_id: "c1" } as never);
    vi.mocked(listCampaigns).mockResolvedValue([{ campaign_id: "c1" }] as never);
    vi.mocked(getCampaignById).mockResolvedValue({ campaign_id: "c1", leads_ordered: 100 } as never);
    vi.mocked(getCampaignLeadStats).mockResolvedValue({ ordered: 100, delivered: 10, rejected: 2, reviewing: 1, rate: 0.02 });
    vi.mocked(updateCampaign).mockResolvedValue({ campaign_id: "c1" } as never);
    vi.mocked(getCampaignLeadsFiltered).mockResolvedValue([{ lead_id: "l1" }] as never);
    vi.mocked(getCampaignDistributionStats).mockResolvedValue({ ordered: 100, delivered: 20, rejected: 5, reviewing: 2, icp_score_distribution: {}, rejection_reasons: {} });
  });

  it("create", async () => {
    const res = await app.request("http://x/api/v1/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: "cl", icp_profile_id: "icp", name: "Alpha", tier: "mql", ordered_count: 100, cpl: 10 }) }, { DB: {} } as never);
    expect(res.status).toBe(201);
  });
  it("list", async () => {
    const res = await app.request("http://x/api/v1/campaigns", { method: "GET" }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
  it("detail", async () => {
    const res = await app.request("http://x/api/v1/campaigns/c1", { method: "GET" }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
  it("update", async () => {
    const res = await app.request("http://x/api/v1/campaigns/c1", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Beta" }) }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
  it("delete", async () => {
    const res = await app.request("http://x/api/v1/campaigns/c1", { method: "DELETE" }, { DB: {} } as never);
    expect(res.status).toBe(204);
  });
  it("leads list", async () => {
    const res = await app.request("http://x/api/v1/campaigns/c1/leads", { method: "GET" }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
  it("stats", async () => {
    const res = await app.request("http://x/api/v1/campaigns/c1/stats", { method: "GET" }, { DB: {} } as never);
    expect(res.status).toBe(200);
  });
});
