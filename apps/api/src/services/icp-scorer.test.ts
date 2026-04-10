import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EnrichedLead, IcpProfile } from "@boss/types";
import { scoreLeadIcp } from "./icp-scorer";
import { ScoringError } from "./errors";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_LEAD: EnrichedLead = {
  email: "john.doe@acme.com",
  first_name: "John",
  last_name: "Doe",
  title: "VP of Engineering",
  company: "Acme Corp",
  industry: "Software",
  company_size: "51-200",
  country: "US",
  seniority: "VP",
  tech_stack: ["Salesforce", "AWS"],
};

const SAMPLE_PROFILE: IcpProfile = {
  id: "icp-001",
  client_id: "client-001",
  industries: ["Software", "SaaS"],
  company_sizes: ["51-200", "201-1000"],
  geographies: ["US", "CA"],
  titles_include: ["VP", "Director", "Head"],
  titles_exclude: ["intern", "junior"],
  seniorities: ["VP", "Director", "C-level"],
  tech_include: ["Salesforce"],
  tech_exclude: ["competitor-tool"],
  weight_industry: 25,
  weight_seniority: 25,
  weight_company_size: 20,
  weight_geography: 15,
  weight_tech: 15,
  min_score_accept: 70,
  min_score_review: 45,
};

const OPTIONS = {
  minReviewScore: 45,
  maxAutoAcceptScore: 70,
  anthropicApiKey: "sk-test-key",
};

// A valid Claude response JSON for the sample lead / profile above.
// Weighted score: (95*25 + 90*25 + 85*20 + 100*15 + 100*15) / 100 = 93
const VALID_CLAUDE_RESPONSE = JSON.stringify({
  breakdown: {
    industry: 95,
    seniority: 90,
    company_size: 85,
    geography: 100,
    tech: 100,
  },
  reasons: [
    "Industry 'Software' is an exact match for the target ICP.",
    "Title 'VP of Engineering' matches the required seniority and title keyword 'VP'.",
    "Company size 51-200 falls within the target range.",
  ],
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAnthropicResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text: content }],
    }),
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

describe("scoreLeadIcp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns a valid ScoringResult for a successful API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeAnthropicResponse(VALID_CLAUDE_RESPONSE)),
    );

    const promise = scoreLeadIcp(SAMPLE_LEAD, SAMPLE_PROFILE, OPTIONS);
    // Advance any timers that might be pending (none here, but safe to call)
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.score).toBe(93); // (95*25 + 90*25 + 85*20 + 100*15 + 100*15) / 100
    expect(result.breakdown).toEqual({
      industry: 95,
      seniority: 90,
      company_size: 85,
      geography: 100,
      tech: 100,
    });
    expect(result.reasons).toHaveLength(3);
    expect(result.decision).toBe("accept"); // 93 >= maxAutoAcceptScore (70)
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sets decision=review when score is between thresholds", async () => {
    // Score engineered to land between 45 and 70
    const reviewResponse = JSON.stringify({
      breakdown: {
        industry: 60,
        seniority: 50,
        company_size: 50,
        geography: 60,
        tech: 50,
      },
      reasons: ["Partial industry match.", "Seniority is adjacent to target."],
    });
    // Weighted: (60*25 + 50*25 + 50*20 + 60*15 + 50*15) / 100 = 5400/100 = 54
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeAnthropicResponse(reviewResponse)),
    );

    const promise = scoreLeadIcp(SAMPLE_LEAD, SAMPLE_PROFILE, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.decision).toBe("review");
    expect(result.score).toBe(54);
  });

  it("sets decision=reject when score is below minReviewScore", async () => {
    const rejectResponse = JSON.stringify({
      breakdown: {
        industry: 0,
        seniority: 20,
        company_size: 30,
        geography: 0,
        tech: 50,
      },
      reasons: ["Industry is not in the target list.", "Country is not in the target geography."],
    });
    // Weighted: (0*25 + 20*25 + 30*20 + 0*15 + 50*15) / 100 = 19
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeAnthropicResponse(rejectResponse)),
    );

    const promise = scoreLeadIcp(SAMPLE_LEAD, SAMPLE_PROFILE, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.decision).toBe("reject");
    expect(result.score).toBe(19);
  });

  it("accepts Claude responses wrapped in markdown code fences", async () => {
    const fencedResponse = "```json\n" + VALID_CLAUDE_RESPONSE + "\n```";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeAnthropicResponse(fencedResponse)),
    );

    const promise = scoreLeadIcp(SAMPLE_LEAD, SAMPLE_PROFILE, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.score).toBe(93);
  });

  it("retries once on invalid JSON and throws ScoringError if second attempt also fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(makeAnthropicResponse("not valid json at all"))
        .mockResolvedValueOnce(makeAnthropicResponse("also not json")),
    );

    let caughtError: unknown;
    const p = scoreLeadIcp(SAMPLE_LEAD, SAMPLE_PROFILE, OPTIONS).catch((e) => {
      caughtError = e;
    });
    await vi.runAllTimersAsync();
    await p;

    expect(caughtError).toBeInstanceOf(ScoringError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries once on Zod schema mismatch and succeeds on second attempt", async () => {
    const badSchema = JSON.stringify({ breakdown: { industry: 80 }, reasons: [] }); // missing fields
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(makeAnthropicResponse(badSchema))
        .mockResolvedValueOnce(makeAnthropicResponse(VALID_CLAUDE_RESPONSE)),
    );

    const promise = scoreLeadIcp(SAMPLE_LEAD, SAMPLE_PROFILE, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.score).toBe(93);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("respects the retry-after header on a 429 response then succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(make429Response(3))   // retry-after: 3s
        .mockResolvedValueOnce(makeAnthropicResponse(VALID_CLAUDE_RESPONSE)),
    );

    const promise = scoreLeadIcp(SAMPLE_LEAD, SAMPLE_PROFILE, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    // Verify retry happened and produced correct result
    expect(result.score).toBe(93);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws ScoringError after exhausting 429 retries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(make429Response(0)), // always 429
    );

    // Pre-attach handler to avoid unhandled rejection window with fake timers
    let caughtError: unknown;
    const p = scoreLeadIcp(SAMPLE_LEAD, SAMPLE_PROFILE, OPTIONS).catch((e) => {
      caughtError = e;
    });
    await vi.runAllTimersAsync();
    await p;

    expect(caughtError).toBeInstanceOf(ScoringError);
    // 1 initial + 2 retries = 3 total calls
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries on 5xx with exponential backoff and succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(make500Response())    // attempt 0 → backoff 1 s
        .mockResolvedValueOnce(makeAnthropicResponse(VALID_CLAUDE_RESPONSE)),
    );

    const promise = scoreLeadIcp(SAMPLE_LEAD, SAMPLE_PROFILE, OPTIONS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.score).toBe(93);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws ScoringError after exhausting 5xx retries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(make500Response()),
    );

    let caughtError: unknown;
    const p = scoreLeadIcp(SAMPLE_LEAD, SAMPLE_PROFILE, OPTIONS).catch((e) => {
      caughtError = e;
    });
    await vi.runAllTimersAsync();
    await p;

    expect(caughtError).toBeInstanceOf(ScoringError);
    expect(fetch).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("throws ScoringError on network / abort error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError")),
    );

    let caughtError: unknown;
    const p = scoreLeadIcp(SAMPLE_LEAD, SAMPLE_PROFILE, OPTIONS).catch((e) => {
      caughtError = e;
    });
    await vi.runAllTimersAsync();
    await p;

    expect(caughtError).toBeInstanceOf(ScoringError);
  });
});
