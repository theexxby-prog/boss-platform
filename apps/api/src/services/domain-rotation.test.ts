import { describe, expect, it, vi } from "vitest";

vi.mock("../db/queries/index", () => ({
  listDomains: vi.fn(),
}));

import { listDomains } from "../db/queries/index";
import { selectSendingDomain } from "./domain-rotation";

describe("selectSendingDomain", () => {
  it("returns highest reputation domain", async () => {
    vi.mocked(listDomains).mockResolvedValue([
      { domain: "a.com", is_active: 1, reputation_score: 50, bounce_rate: 0, spam_rate: 0, daily_send_count: 10 },
      { domain: "b.com", is_active: 1, reputation_score: 50, bounce_rate: 0, spam_rate: 0, daily_send_count: 1 },
    ] as never);
    const kv: any = {
      get: vi.fn()
        .mockResolvedValueOnce(JSON.stringify({ score: 90, bounce_rate: 0.01, spam_rate: 0.01, daily_sends: 5 }))
        .mockResolvedValueOnce(JSON.stringify({ score: 80, bounce_rate: 0.01, spam_rate: 0.01, daily_sends: 1 })),
      put: vi.fn().mockResolvedValue(undefined),
    };

    const result = await selectSendingDomain("cmp-1", "tenant-1", { db: {} as D1Database, kv });
    expect(result.domain).toBe("a.com");
    expect(kv.put).toHaveBeenCalled();
  });

  it("throws when no domains exist", async () => {
    vi.mocked(listDomains).mockResolvedValue([] as never);
    await expect(
      selectSendingDomain("cmp-1", "tenant-1", { db: {} as D1Database, kv: {} as never }),
    ).rejects.toThrow();
  });
});
