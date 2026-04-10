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
  createDomain: vi.fn(),
  deleteDomain: vi.fn(),
  getDomainByName: vi.fn(),
  listDomains: vi.fn(),
  updateDomainActiveStatus: vi.fn(),
}));

import { createDomain, getDomainByName, listDomains } from "../db/queries/index";
import { domainsRouter } from "./domains";

const app = new Hono().basePath("/api/v1");
app.route("/domains", domainsRouter);

const env = {
  DB: {},
  KV: {
    get: vi.fn().mockResolvedValue(JSON.stringify({ score: 80, bounce_rate: 0.01, spam_rate: 0.01, daily_sends: 5 })),
    put: vi.fn().mockResolvedValue(undefined),
  },
} as never;

describe("domains routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createDomain).mockResolvedValue({ domain: "a.com" } as never);
    vi.mocked(listDomains).mockResolvedValue([{ domain: "a.com", is_active: 1 }] as never);
    vi.mocked(getDomainByName).mockResolvedValue({ domain: "a.com", is_active: 1 } as never);
  });

  it("create", async () => {
    const res = await app.request("http://x/api/v1/domains", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: "a.com", dkim_verified: true, spf_verified: true }) }, env);
    expect(res.status).toBe(201);
  });
  it("list", async () => {
    const res = await app.request("http://x/api/v1/domains", { method: "GET" }, env);
    expect(res.status).toBe(200);
  });
  it("health detail", async () => {
    const res = await app.request("http://x/api/v1/domains/a.com", { method: "GET" }, env);
    expect(res.status).toBe(200);
  });
});
