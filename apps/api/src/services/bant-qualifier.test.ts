import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BantLead, BantCriteria } from "./bant-qualifier";
import { qualifyBant } from "./bant-qualifier";
import { BantQualificationError } from "./errors";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_LEAD: BantLead = {
  lead_id: "lead-001",
  email: "sarah.cto@acme.com",
  first_name: "Sarah",
  last_name: "Chen",
  title: "CTO",
  company: "Acme SaaS",
  industry: "SaaS",
  company_size: "201-1000",
  country: "US",
  seniority: "C-level",
  tech_stack: ["AWS", "Salesforce"],
};

const SAMPLE_CRITERIA: BantCriteria = {
  budget_signals: ["budget", "funding", "investment"],
  authority_titles: ["CEO", "CTO", "CFO", "VP", "Director"],
  need_industries: ["SaaS", "FinTech", "Software"],
  timeline_signals: ["ASAP", "urgent", "Q2", "this quarter"],
};

const OPTIONS = {
  qualificationThreshold: 60,
  anthropicApiKey: "sk-test-key",
};

// Qualified lead response — bant_score = 22+22+20+18 = 82
const QUALIFIED_CLAUDE_RESPONSE = JSON.stringify({
  breakdown: { budget: 22, authority: 22, need: 20, timeline: 18 },
  reasoning:
    "CTO title provides clear authority. SaaS industry matches need_industries. Company size 201-1000 implies dedicated budget. Active seniority suggests near-term buying cycle.",
});

// Unqualified lead response — bant_score = 5+5+5+5 = 20
const UNQUALIFIED_CLAUDE_RESPONSE = JSON.stringify({
  breakdown: { budget: 5, authority: 5, need: 5, timeline: 5 },
  reasoning:
    "No clear budget signals. Title does not match authority criteria. Industry is adjacent but not in target list. No urgency indicators present.",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAnthropicResponse(content: string): Response {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text: content }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function make429Response(retryAfterSeconds = 1): Response {
  return new Response(JSON.stringify({ error: "rate limited" }), {
    status: 429,
    headers: { "retry-after": String(retryAfterSeconds), "content-type": "application/json" },
  });
}

function make500Response(): Response {
  return new Response(JSON.stringify({ error: "internal server error" }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("qualifyBant", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ── Success paths ──────────────────────────────────────────────────────────

  it("returns a valid BantQualificationResult for a qualified lead", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeAnthropicResponse(QUALIFIED_CLAUDE_RESPONSE)));

    const promise = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.lead_id).toBe("lead-001");
    expect(result.bant_score).toBe(82); // 22+22+20+18
    expect(result.bant_breakdown.budget).toBe(22);
    expect(result.bant_breakdown.authority).toBe(22);
    expect(result.bant_breakdown.need).toBe(20);
    expect(result.bant_breakdown.timeline).toBe(18);
    expect(result.bant_breakdown.reasoning).toContain("CTO");
    expect(result.qualified).toBe(true); // 82 >= 60
    expect(result.error).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sets qualified=false when bant_score is below qualificationThreshold", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeAnthropicResponse(UNQUALIFIED_CLAUDE_RESPONSE)));

    const promise = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.bant_score).toBe(20); // 5+5+5+5
    expect(result.qualified).toBe(false); // 20 < 60
  });

  it("sets qualified=true at exactly the qualification threshold (boundary)", async () => {
    // bant_score = 15+15+15+15 = 60 — exactly at threshold
    const boundaryResponse = JSON.stringify({
      breakdown: { budget: 15, authority: 15, need: 15, timeline: 15 },
      reasoning: "Meets minimum qualification on all dimensions.",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeAnthropicResponse(boundaryResponse)));

    const promise = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.bant_score).toBe(60);
    expect(result.qualified).toBe(true);
  });

  it("accepts Claude responses wrapped in markdown code fences", async () => {
    const fenced = "```json\n" + QUALIFIED_CLAUDE_RESPONSE + "\n```";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeAnthropicResponse(fenced)));

    const promise = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.bant_score).toBe(82);
    expect(result.qualified).toBe(true);
  });

  it("uses empty criteria gracefully (all optional fields absent)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeAnthropicResponse(QUALIFIED_CLAUDE_RESPONSE)));

    const promise = qualifyBant(SAMPLE_LEAD, {}, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.bant_score).toBe(82);
  });

  // ── Retry / error paths ────────────────────────────────────────────────────

  it("retries once on invalid JSON and throws BantQualificationError if both attempts fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(makeAnthropicResponse("not valid json"))
        .mockResolvedValueOnce(makeAnthropicResponse("still not json")),
    );

    let caughtError: unknown;
    const p = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS).catch((e) => { caughtError = e; });
    await vi.runAllTimersAsync();
    await p;

    expect(caughtError).toBeInstanceOf(BantQualificationError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries once on Zod schema mismatch and succeeds on second attempt", async () => {
    const badSchema = JSON.stringify({ breakdown: { budget: 10 }, reasoning: "partial" }); // missing fields
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(makeAnthropicResponse(badSchema))
        .mockResolvedValueOnce(makeAnthropicResponse(QUALIFIED_CLAUDE_RESPONSE)),
    );

    const promise = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.bant_score).toBe(82);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on a 429 response (honours retry-after) then succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(make429Response(2))
        .mockResolvedValueOnce(makeAnthropicResponse(QUALIFIED_CLAUDE_RESPONSE)),
    );

    const promise = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.bant_score).toBe(82);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws BantQualificationError after exhausting 429 retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(make429Response(0)));

    let caughtError: unknown;
    const p = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS).catch((e) => { caughtError = e; });
    await vi.runAllTimersAsync();
    await p;

    expect(caughtError).toBeInstanceOf(BantQualificationError);
    expect(fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("retries on 5xx with exponential backoff and succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(make500Response())
        .mockResolvedValueOnce(makeAnthropicResponse(QUALIFIED_CLAUDE_RESPONSE)),
    );

    const promise = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.bant_score).toBe(82);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws BantQualificationError after exhausting 5xx retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(make500Response()));

    let caughtError: unknown;
    const p = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS).catch((e) => { caughtError = e; });
    await vi.runAllTimersAsync();
    await p;

    expect(caughtError).toBeInstanceOf(BantQualificationError);
    expect(fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("throws BantQualificationError on network abort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError")),
    );

    let caughtError: unknown;
    const p = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS).catch((e) => { caughtError = e; });
    await vi.runAllTimersAsync();
    await p;

    expect(caughtError).toBeInstanceOf(BantQualificationError);
  });

  // ── Dimension boundary checks ─────────────────────────────────────────────

  it("rejects a response where a dimension exceeds 25", async () => {
    const outOfBounds = JSON.stringify({
      breakdown: { budget: 30, authority: 20, need: 20, timeline: 20 }, // budget > 25
      reasoning: "out of bounds test",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(makeAnthropicResponse(outOfBounds))
        .mockResolvedValueOnce(makeAnthropicResponse(QUALIFIED_CLAUDE_RESPONSE)),
    );

    const promise = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    // First response rejected by Zod; second succeeds
    expect(result.bant_score).toBe(82);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects a response with a non-integer dimension score", async () => {
    const floatScore = JSON.stringify({
      breakdown: { budget: 12.5, authority: 20, need: 20, timeline: 20 },
      reasoning: "float score test",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(makeAnthropicResponse(floatScore))
        .mockResolvedValueOnce(makeAnthropicResponse(QUALIFIED_CLAUDE_RESPONSE)),
    );

    const promise = qualifyBant(SAMPLE_LEAD, SAMPLE_CRITERIA, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.bant_score).toBe(82);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
