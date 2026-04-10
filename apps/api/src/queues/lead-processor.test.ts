import { beforeEach, describe, expect, it, vi } from "vitest";
import type { D1Database, KVNamespace, Queue } from "@cloudflare/workers-types";

vi.mock("../db/queries/index", () => ({
  checkDuplicateEmail: vi.fn(),
  createOpsQueueEntry: vi.fn(),
  getCampaignById: vi.fn(),
  getCampaignDailyDeliveryCount: vi.fn(),
  getCustomQuestionsByCampaign: vi.fn(),
  getIcpProfileByCampaign: vi.fn(),
  getLeadById: vi.fn(),
  updateLeadBant: vi.fn(),
  updateLeadScore: vi.fn(),
  updateLeadStatus: vi.fn(),
}));

vi.mock("../services/enrichment", () => ({
  enrichLead: vi.fn(),
}));

vi.mock("../services/icp-scorer", () => ({
  scoreLeadIcp: vi.fn(),
}));

vi.mock("../services/bant-qualifier", () => ({
  qualifyBant: vi.fn(),
}));

import {
  checkDuplicateEmail,
  createOpsQueueEntry,
  getCampaignById,
  getCampaignDailyDeliveryCount,
  getCustomQuestionsByCampaign,
  getIcpProfileByCampaign,
  getLeadById,
  updateLeadScore,
  updateLeadStatus,
} from "../db/queries/index";
import { scoreLeadIcp } from "../services/icp-scorer";
import { enrichLead } from "../services/enrichment";
import { processLead } from "./lead-processor";

const env = {
  DB: {} as D1Database,
  KV: { put: vi.fn() } as unknown as KVNamespace,
  QUEUE: { send: vi.fn() } as unknown as Queue,
  ANTHROPIC_API_KEY: "key",
  ZEROBOUNCE_API_KEY: "zb",
  APOLLO_API_KEY: "apollo",
  CLEARBIT_API_KEY: "clearbit",
};

describe("processLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLeadById).mockResolvedValue({
      lead_id: "lead-1",
      tenant_id: "tenant-1",
      campaign_id: "cmp-1",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
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
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    vi.mocked(checkDuplicateEmail).mockResolvedValue(false);
    vi.mocked(enrichLead).mockResolvedValue({
      email: "ada@example.com",
      company: "Acme",
      company_size: "51-200",
    });
    vi.mocked(getIcpProfileByCampaign).mockResolvedValue({
      id: "icp-1",
      client_id: "client-1",
      industries: ["Software"],
      company_sizes: ["51-200"],
      geographies: ["US"],
      titles_include: ["Head"],
      titles_exclude: [],
      seniorities: ["Director"],
      tech_include: [],
      tech_exclude: [],
      weight_industry: 20,
      weight_seniority: 20,
      weight_company_size: 20,
      weight_geography: 20,
      weight_tech: 20,
      min_score_accept: 70,
      min_score_review: 50,
    });
    vi.mocked(scoreLeadIcp).mockResolvedValue({
      score: 80,
      breakdown: {
        industry: 80,
        seniority: 80,
        company_size: 80,
        geography: 80,
        tech: 80,
      },
      reasons: ["good fit"],
      decision: "accept",
    });
    vi.mocked(getCampaignById).mockResolvedValue({
      campaign_id: "cmp-1",
      tenant_id: "tenant-1",
      client_id: "client-1",
      icp_profile_id: "icp-1",
      name: "Campaign",
      product_tier: "mql",
      leads_ordered: 100,
      leads_delivered: 0,
      daily_cap: 20,
      status: "active",
      custom_questions: "[]",
    });
    vi.mocked(getCampaignDailyDeliveryCount).mockResolvedValue(2);
    vi.mocked(getCustomQuestionsByCampaign).mockResolvedValue([]);
  });

  it("accepts high scoring lead", async () => {
    await processLead({ lead_id: "lead-1", campaign_id: "cmp-1", tenant_id: "tenant-1" }, env);
    expect(updateLeadStatus).toHaveBeenLastCalledWith(env.DB, "tenant-1", "lead-1", "accepted");
    expect(updateLeadScore).toHaveBeenCalled();
  });

  it("marks duplicate leads", async () => {
    vi.mocked(checkDuplicateEmail).mockResolvedValue(true);
    await processLead({ lead_id: "lead-1", campaign_id: "cmp-1", tenant_id: "tenant-1" }, env);
    expect(updateLeadStatus).toHaveBeenLastCalledWith(
      env.DB,
      "tenant-1",
      "lead-1",
      "duplicate",
      "Duplicate delivered email",
    );
  });

  it("rejects low score lead", async () => {
    vi.mocked(scoreLeadIcp).mockResolvedValue({
      score: 20,
      breakdown: { industry: 10, seniority: 10, company_size: 10, geography: 10, tech: 10 },
      reasons: ["low fit"],
      decision: "reject",
    });
    await processLead({ lead_id: "lead-1", campaign_id: "cmp-1", tenant_id: "tenant-1" }, env);
    expect(updateLeadStatus).toHaveBeenLastCalledWith(
      env.DB,
      "tenant-1",
      "lead-1",
      "rejected",
      "ICP score below threshold",
    );
  });

  it("sends enrichment errors to ops queue", async () => {
    vi.mocked(enrichLead).mockRejectedValue(new Error("timeout"));
    await processLead({ lead_id: "lead-1", campaign_id: "cmp-1", tenant_id: "tenant-1" }, env);
    expect(updateLeadStatus).toHaveBeenCalledWith(env.DB, "tenant-1", "lead-1", "reviewing", "Enrichment failed");
    expect(createOpsQueueEntry).toHaveBeenCalled();
  });

  it("re-queues when daily cap is reached", async () => {
    vi.mocked(getCampaignDailyDeliveryCount).mockResolvedValue(20);
    await processLead({ lead_id: "lead-1", campaign_id: "cmp-1", tenant_id: "tenant-1" }, env);
    expect(env.QUEUE.send).toHaveBeenCalled();
  });
});
