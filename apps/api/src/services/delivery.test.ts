import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/queries/index", () => ({
  createDeliveryBatchRecord: vi.fn(),
  createInvoiceRecord: vi.fn(),
  createOpsQueueEntry: vi.fn(),
  getCampaignById: vi.fn(),
  getClientById: vi.fn(),
  incrementCampaignDeliveredCount: vi.fn(),
  markLeadsDelivered: vi.fn(),
  updateDeliveryBatch: vi.fn(),
}));

import {
  createDeliveryBatchRecord,
  createInvoiceRecord,
  createOpsQueueEntry,
  getCampaignById,
  getClientById,
  incrementCampaignDeliveredCount,
  markLeadsDelivered,
  updateDeliveryBatch,
} from "../db/queries/index";
import { createDeliveryBatch } from "./delivery";

describe("createDeliveryBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCampaignById).mockResolvedValue({
      campaign_id: "cmp-1",
      client_id: "client-1",
      cpl: 10,
      name: "Campaign",
    } as never);
    vi.mocked(createDeliveryBatchRecord).mockResolvedValue({
      batch_id: "batch-1",
      campaign_id: "cmp-1",
      tenant_id: "tenant-1",
      lead_count: 1,
      r2_key: "k",
      delivery_status: "pending",
      sent_at: null,
      acknowledged_at: null,
      invoice_id: null,
      created_at: Date.now(),
    } as never);
    vi.mocked(getClientById).mockResolvedValue({
      client_id: "client-1",
      type: "direct",
      payment_terms: 30,
    } as never);
    vi.mocked(createInvoiceRecord).mockResolvedValue({ invoice_id: "inv-1" } as never);
  });

  it("creates + uploads delivery batch", async () => {
    const r2: any = {
      put: vi.fn().mockResolvedValue(undefined),
      createPresignedUrl: vi.fn().mockResolvedValue("https://signed"),
    };
    const result = await createDeliveryBatch(
      "cmp-1",
      "tenant-1",
      [{ lead_id: "lead-1", email: "a@b.com" } as never],
      { db: {} as D1Database, r2 },
    );
    expect(result.file_url).toBe("https://signed");
    expect(r2.put).toHaveBeenCalled();
    expect(incrementCampaignDeliveredCount).toHaveBeenCalled();
  });

  it("handles R2 failure by queueing ops task", async () => {
    const r2: any = {
      put: vi.fn().mockRejectedValue(new Error("r2 down")),
      createPresignedUrl: vi.fn(),
    };
    await expect(
      createDeliveryBatch("cmp-1", "tenant-1", [{ lead_id: "lead-1", email: "a@b.com" } as never], {
        db: {} as D1Database,
        r2,
      }),
    ).rejects.toThrow();
    expect(createOpsQueueEntry).toHaveBeenCalled();
    expect(updateDeliveryBatch).toHaveBeenCalled();
  });

  it("still fails cleanly on invoice error", async () => {
    vi.mocked(createInvoiceRecord).mockRejectedValue(new Error("invoice fail"));
    const r2: any = {
      put: vi.fn().mockResolvedValue(undefined),
      createPresignedUrl: vi.fn().mockResolvedValue("https://signed"),
    };
    await expect(
      createDeliveryBatch("cmp-1", "tenant-1", [{ lead_id: "lead-1", email: "a@b.com" } as never], {
        db: {} as D1Database,
        r2,
      }),
    ).rejects.toThrow();
    expect(createOpsQueueEntry).toHaveBeenCalled();
    expect(markLeadsDelivered).not.toHaveBeenCalled();
  });
});
