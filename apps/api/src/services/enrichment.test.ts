import { beforeEach, describe, expect, it, vi } from "vitest";

import { enrichLead } from "./enrichment";
import { EnrichmentError } from "./errors";

describe("enrichLead", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("enriches a valid lead successfully", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: "valid", score: 9 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            person: {
              first_name: "Ada",
              last_name: "Lovelace",
              title: "CTO",
              linkedin_url: "https://linkedin.com/in/ada",
              location: { country: "US", state: "NY" },
            },
            organization: {
              name: "Analytical Engines",
              website_url: "https://analytical.com",
              industry: "Software",
              estimated_num_employees: 120,
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ company: { category: { industry: "Software" } } }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichLead(
      { email: "ada@example.com" },
      "tenant-1",
      {
        zeroBouncerApiKey: "zb_live",
        apolloApiKey: "apollo_live",
        clearbitApiKey: "clearbit_live",
      },
    );

    expect(result.email).toBe("ada@example.com");
    expect(result.company).toBe("Analytical Engines");
    expect(result.company_size).toBe("51-200");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws EnrichmentError for invalid email", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: "invalid", score: 1 }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      enrichLead(
        { email: "bad@example.com" },
        "tenant-1",
        {
          zeroBouncerApiKey: "zb_live",
          apolloApiKey: "apollo_live",
          clearbitApiKey: "clearbit_live",
        },
      ),
    ).rejects.toBeInstanceOf(EnrichmentError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws EnrichmentError on API timeout/network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network timeout")));

    await expect(
      enrichLead(
        { email: "ok@example.com" },
        "tenant-1",
        {
          zeroBouncerApiKey: "zb_live",
          apolloApiKey: "apollo_live",
          clearbitApiKey: "clearbit_live",
        },
      ),
    ).rejects.toBeInstanceOf(EnrichmentError);
  });
});
