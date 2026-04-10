import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { D1Database, KVNamespace, Queue, R2Bucket } from "@cloudflare/workers-types";

vi.mock("../middleware/auth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("auth", { tenantId: "tenant-1", authType: "jwt", userId: "u-1", role: "owner" });
    await next();
  },
  sha256Hex: vi.fn().mockResolvedValue("hash"),
}));

vi.mock("../middleware/tenant", () => ({
  requireTenant: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("tenantId", "tenant-1");
    await next();
  },
}));

vi.mock("../db/queries/index", () => ({
  createLead: vi.fn(),
  getCampaignById: vi.fn(),
  getLeadById: vi.fn(),
  getLeadsByCampaign: vi.fn(),
}));

import { createLead, getCampaignById, getLeadById, getLeadsByCampaign } from "../db/queries/index";
import { leadsRouter } from "./leads";

const app = new Hono().basePath("/api/v1");
app.route("/leads", leadsRouter);

const env = {
  DB: {} as D1Database,
  KV: {} as KVNamespace,
  R2: {} as R2Bucket,
  QUEUE: { send: vi.fn() } as unknown as Queue,
  LEAD_QUEUE: { send: vi.fn() } as unknown as Queue,
  JWT_SECRET: "secret",
  API_KEY_SALT: "salt",
};

describe("routes/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCampaignById).mockResolvedValue({
      campaign_id: "cmp-1",
      tenant_id: "tenant-1",
      client_id: "client-1",
      icp_profile_id: "icp-1",
      name: "Campaign",
      product_tier: "mql",
      leads_ordered: 100,
      leads_delivered: 0,
      cpl: 10,
      daily_cap: 10,
      status: "active",
      custom_questions: "[]",
    });
    vi.mocked(createLead).mockResolvedValue({ lead_id: "lead-1" } as never);
    vi.mocked(getLeadById).mockResolvedValue({ lead_id: "lead-1" } as never);
    vi.mocked(getLeadsByCampaign).mockResolvedValue([{ lead_id: "lead-1" }] as never);
  });

  it("POST /leads queues valid leads", async () => {
    const res = await app.request(
      "http://localhost/api/v1/leads",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer token" },
        body: JSON.stringify({
          campaign_id: "cmp-1",
          leads: [{ email: "ada@example.com" }],
        }),
      },
      env,
    );
    expect(res.status).toBe(202);
    expect(env.QUEUE.send).toHaveBeenCalledTimes(1);
  });

  it("POST /leads rejects invalid email", async () => {
    const res = await app.request(
      "http://localhost/api/v1/leads",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer token" },
        body: JSON.stringify({
          campaign_id: "cmp-1",
          leads: [{ email: "not-an-email" }],
        }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("POST /leads returns 404 for missing campaign", async () => {
    vi.mocked(getCampaignById).mockResolvedValue(null);
    const res = await app.request(
      "http://localhost/api/v1/leads",
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer token" },
        body: JSON.stringify({
          campaign_id: "missing",
          leads: [{ email: "ada@example.com" }],
        }),
      },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("GET /leads returns filtered list", async () => {
    const res = await app.request(
      "http://localhost/api/v1/leads?campaign_id=cmp-1&status=accepted",
      { method: "GET", headers: { authorization: "Bearer token" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(getLeadsByCampaign).toHaveBeenCalledWith(env.DB, "tenant-1", "cmp-1", "accepted");
  });

  it("GET /leads/:leadId returns detail", async () => {
    const res = await app.request(
      "http://localhost/api/v1/leads/lead-1",
      { method: "GET", headers: { authorization: "Bearer token" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(getLeadById).toHaveBeenCalledWith(env.DB, "tenant-1", "lead-1");
  });
});
