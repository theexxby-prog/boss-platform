import { describe, expect, it } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";

import {
  checkDuplicateEmail,
  createLead,
  createOpsQueueEntry,
  getCampaignById,
  getCampaignDailyDeliveryCount,
  getCampaignsByStatus,
  getCustomQuestionsByCampaign,
  getIcpProfileByCampaign,
  getIcpProfileById,
  getLeadById,
  getLeadsByEmail,
  getLeadsByIds,
  getLeadsByStatus,
  getOpsQueueByLeadId,
  updateLeadScore,
  updateLeadStatus,
} from "./index";

type MockDb = {
  prepare: (sql: string) => {
    bind: (...params: unknown[]) => {
      first: <T>() => Promise<T | null>;
      all: <T>() => Promise<{ results: T[] }>;
      run: () => Promise<{ success: boolean; meta?: { last_row_id?: number; changes?: number } }>;
    };
  };
  __lastSql: string;
  __lastParams: unknown[];
};

function createMockDb(overrides?: {
  first?: unknown;
  all?: unknown[];
}): MockDb {
  const state = {
    sql: "",
    params: [] as unknown[],
  };
  return {
    prepare(sql: string) {
      state.sql = sql;
      return {
        bind(...params: unknown[]) {
          state.params = params;
          return {
            first: async <T>() => (overrides?.first ?? null) as T | null,
            all: async <T>() => ({ results: (overrides?.all ?? []) as T[] }),
            run: async () => ({ success: true, meta: { last_row_id: 1, changes: 1 } }),
          };
        },
      };
    },
    get __lastSql() {
      return state.sql;
    },
    get __lastParams() {
      return state.params;
    },
  };
}

const TENANT_ID = "tenant-1";

describe("db/queries tenant isolation", () => {
  it("getLeadById filters by tenant_id", async () => {
    const db = createMockDb();
    await getLeadById(db as unknown as D1Database, TENANT_ID, "lead-1");
    expect(db.__lastSql).toContain("tenant_id = ?");
    expect(db.__lastParams[0]).toBe(TENANT_ID);
  });

  it("getLeadsByEmail filters by tenant_id", async () => {
    const db = createMockDb();
    await getLeadsByEmail(db as unknown as D1Database, TENANT_ID, "foo@bar.com");
    expect(db.__lastSql).toContain("tenant_id = ?");
    expect(db.__lastParams[0]).toBe(TENANT_ID);
  });

  it("getLeadsByStatus filters by tenant_id", async () => {
    const db = createMockDb();
    await getLeadsByStatus(db as unknown as D1Database, TENANT_ID, "accepted");
    expect(db.__lastSql).toContain("tenant_id = ?");
  });

  it("createLead writes with tenant_id", async () => {
    const db = createMockDb({
      first: {
        lead_id: "l-1",
      },
    });
    await createLead(db as unknown as D1Database, TENANT_ID, {
      campaign_id: "c-1",
      first_name: null,
      last_name: null,
      email: "a@b.com",
      phone: null,
      title: null,
      company: null,
      company_domain: null,
      linkedin_url: null,
      industry: null,
      company_size: null,
      country: null,
      state: null,
      seniority: null,
      tech_stack: "[]",
      email_status: null,
      email_score: null,
      icp_score: null,
      icp_score_breakdown: null,
      icp_reasons: "[]",
      custom_answers: "[]",
      bant_budget: null,
      bant_authority: null,
      bant_need: null,
      bant_timeline: null,
      bant_score: null,
      bant_confidence: null,
      bant_notes: null,
      appt_scheduled_at: null,
      appt_calendar_link: null,
      appt_status: null,
      status: "ingested",
      rejection_reason: null,
      ops_reviewer_id: null,
      delivered_at: null,
      delivery_batch_id: null,
      client_rejected: 0,
      client_rejected_reason: null,
      client_rejected_at: null,
      replacement_lead_id: null,
      dedup_hash: "hash",
      source_domain: null,
    });
    expect(db.__lastParams).toContain(TENANT_ID);
  });

  it("updateLeadStatus filters by tenant_id", async () => {
    const db = createMockDb();
    await updateLeadStatus(db as unknown as D1Database, TENANT_ID, "lead-1", "reviewing");
    expect(db.__lastSql).toContain("tenant_id = ?");
  });

  it("updateLeadScore filters by tenant_id", async () => {
    const db = createMockDb();
    await updateLeadScore(db as unknown as D1Database, TENANT_ID, "lead-1", 80, {
      industry: 10,
      seniority: 20,
      company_size: 20,
      geography: 20,
      tech: 30,
    });
    expect(db.__lastSql).toContain("tenant_id = ?");
  });

  it("checkDuplicateEmail filters by tenant_id", async () => {
    const db = createMockDb({ first: { count: 1 } });
    await checkDuplicateEmail(db as unknown as D1Database, TENANT_ID, "foo@bar.com");
    expect(db.__lastSql).toContain("tenant_id = ?");
  });

  it("getLeadsByIds filters by tenant_id", async () => {
    const db = createMockDb();
    await getLeadsByIds(db as unknown as D1Database, TENANT_ID, ["1", "2"]);
    expect(db.__lastSql).toContain("tenant_id = ?");
    expect(db.__lastParams[0]).toBe(TENANT_ID);
  });

  it("getCampaignById filters by tenant_id", async () => {
    const db = createMockDb();
    await getCampaignById(db as unknown as D1Database, TENANT_ID, "c-1");
    expect(db.__lastSql).toContain("tenant_id = ?");
  });

  it("getCampaignsByStatus filters by tenant_id", async () => {
    const db = createMockDb();
    await getCampaignsByStatus(db as unknown as D1Database, TENANT_ID, "active");
    expect(db.__lastSql).toContain("tenant_id = ?");
  });

  it("getCampaignDailyDeliveryCount filters by tenant_id", async () => {
    const db = createMockDb();
    await getCampaignDailyDeliveryCount(db as unknown as D1Database, TENANT_ID, "c-1", "2026-04-10");
    expect(db.__lastSql).toContain("tenant_id = ?");
  });

  it("getIcpProfileById filters by tenant_id", async () => {
    const db = createMockDb();
    await getIcpProfileById(db as unknown as D1Database, TENANT_ID, "p-1");
    expect(db.__lastSql).toContain("tenant_id = ?");
  });

  it("getIcpProfileByCampaign filters by tenant_id", async () => {
    const db = createMockDb();
    await getIcpProfileByCampaign(db as unknown as D1Database, TENANT_ID, "c-1");
    expect(db.__lastSql).toContain("tenant_id = ?");
  });

  it("getCustomQuestionsByCampaign filters by tenant_id", async () => {
    const db = createMockDb({ first: { custom_questions: "[]" } });
    await getCustomQuestionsByCampaign(db as unknown as D1Database, TENANT_ID, "c-1");
    expect(db.__lastSql).toContain("tenant_id = ?");
  });

  it("createOpsQueueEntry writes tenant_id", async () => {
    const db = createMockDb();
    await createOpsQueueEntry(db as unknown as D1Database, TENANT_ID, {
      lead_id: "l-1",
      task_type: "lead_review",
      priority: "normal",
      description: "review",
      assigned_to: null,
      status: "open",
      resolution: null,
      resolved_at: null,
      sla_deadline: Date.now(),
      updated_at: Date.now(),
    });
    expect(db.__lastParams[1]).toBe(TENANT_ID);
  });

  it("getOpsQueueByLeadId filters by tenant_id", async () => {
    const db = createMockDb();
    await getOpsQueueByLeadId(db as unknown as D1Database, TENANT_ID, "l-1");
    expect(db.__lastSql).toContain("tenant_id = ?");
  });
});
