import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/queries/index", () => ({
  createOpsQueueEntry: vi.fn().mockResolvedValue("q1"),
  findLeadByEmail: vi.fn().mockResolvedValue({ lead_id: "l1" }),
  getDeliveryBatchById: vi.fn().mockResolvedValue({ batch_id: "b1" }),
  updateDeliveryBatch: vi.fn(),
  updateLeadStatusText: vi.fn(),
}));

import { webhooksRouter } from "./webhooks";

const app = new Hono().basePath("/api/v1");
app.route("/webhooks", webhooksRouter);

async function signature(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("webhooks routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts valid signature", async () => {
    const body = JSON.stringify({ event: "opened", email: "a@b.com", timestamp: Date.now() });
    const sig = await signature("secret", body);
    const res = await app.request(
      "http://x/api/v1/webhooks/instantly",
      { method: "POST", headers: { "content-type": "application/json", "x-boss-signature": sig, "x-tenant-id": "tenant-1" }, body },
      { DB: {}, KV: { put: vi.fn().mockResolvedValue(undefined) }, JWT_SECRET: "secret" } as never,
    );
    expect(res.status).toBe(202);
  });

  it("rejects invalid signature", async () => {
    const body = JSON.stringify({ event: "opened", email: "a@b.com", timestamp: Date.now() });
    const res = await app.request(
      "http://x/api/v1/webhooks/instantly",
      { method: "POST", headers: { "content-type": "application/json", "x-boss-signature": "bad", "x-tenant-id": "tenant-1" }, body },
      { DB: {}, KV: { put: vi.fn().mockResolvedValue(undefined) }, JWT_SECRET: "secret" } as never,
    );
    expect(res.status).toBe(401);
  });
});
