// REF: boss-hq/worker/src/services/integrationService.ts — timeout + retry + typed error wrapping

import type { CompanySize, EmailStatus, EnrichedLead, RawLead } from "@boss/types";

import { EnrichmentError } from "./errors";

const TIMEOUT_MS = 5_000;
const MAX_RETRIES = 2;

interface RetryOptions {
  service: string;
  timeoutMs?: number;
  retries?: number;
}

interface ZeroBounceResult {
  status: string;
  sub_status?: string;
  score?: number;
}

interface ApolloResult {
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
  industry?: string;
  company_size?: CompanySize;
  linkedin_url?: string;
  company_domain?: string;
  country?: string;
  state?: string;
}

interface ClearbitResult {
  industry?: string;
  company_size?: CompanySize;
  raw_signals: Record<string, unknown>;
}

export interface EnrichmentOptions {
  zeroBouncerApiKey: string;
  apolloApiKey: string;
  clearbitApiKey: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapCompanySize(value: number | null | undefined): CompanySize | undefined {
  if (value === null || value === undefined || Number.isNaN(value)) return undefined;
  if (value <= 50) return "1-50";
  if (value <= 200) return "51-200";
  if (value <= 1000) return "201-1000";
  return "1000+";
}

function mapEmailStatus(status: string): EmailStatus {
  if (status === "valid") return "valid";
  if (status === "invalid") return "invalid";
  if (status === "catch-all" || status === "catch_all") return "catch-all";
  return "unknown";
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions,
  attempt = 0,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    clearTimeout(timeout);
    throw new EnrichmentError("ENRICHMENT_NETWORK_ERROR", `${options.service} request failed`, {
      attempt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  clearTimeout(timeout);

  if (response.status === 429 && attempt < (options.retries ?? MAX_RETRIES)) {
    const retryAfter = Number(response.headers.get("retry-after") ?? "1");
    await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000);
    return fetchWithRetry(url, init, options, attempt + 1);
  }

  if (response.status >= 500 && response.status < 600 && attempt < (options.retries ?? MAX_RETRIES)) {
    await sleep(Math.pow(2, attempt) * 250);
    return fetchWithRetry(url, init, options, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new EnrichmentError("ENRICHMENT_HTTP_ERROR", `${options.service} returned ${response.status}`, {
      body: body.slice(0, 300),
      status: response.status,
    });
  }

  return response;
}

async function callZeroBounce(email: string, apiKey: string): Promise<ZeroBounceResult> {
  // Stub mode for local tests/dev.
  if (apiKey.startsWith("mock_")) {
    return { status: "valid", score: 9 };
  }

  const url = new URL("https://api.zerobounce.net/v2/validate");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("email", email);
  const response = await fetchWithRetry(url.toString(), { method: "GET" }, { service: "zerobounce" });
  return (await response.json()) as ZeroBounceResult;
}

async function callApollo(lead: RawLead, apiKey: string): Promise<ApolloResult> {
  // Stub mode for local tests/dev.
  if (apiKey.startsWith("mock_")) {
    return {
      first_name: lead.first_name,
      last_name: lead.last_name,
      title: lead.title ?? "Head of Growth",
      company: lead.company ?? "Acme",
      industry: "Software",
      company_size: "51-200",
      linkedin_url: lead.linkedin_url ?? "https://linkedin.com/in/mock-lead",
      company_domain: lead.company_domain ?? "acme.com",
      country: "US",
      state: "CA",
    };
  }

  const response = await fetchWithRetry(
    "https://api.apollo.io/v1/people/match",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        email: lead.email,
        first_name: lead.first_name,
        last_name: lead.last_name,
        organization_name: lead.company,
      }),
    },
    { service: "apollo" },
  );
  const raw = (await response.json()) as {
    person?: { first_name?: string; last_name?: string; title?: string; linkedin_url?: string; location?: { country?: string; state?: string } };
    organization?: { name?: string; website_url?: string; industry?: string; estimated_num_employees?: number };
  };

  if (!raw.person && !raw.organization) {
    throw new EnrichmentError("ENRICHMENT_APOLLO_EMPTY", "Apollo did not return a match");
  }

  return {
    first_name: raw.person?.first_name,
    last_name: raw.person?.last_name,
    title: raw.person?.title,
    company: raw.organization?.name,
    industry: raw.organization?.industry,
    company_size: mapCompanySize(raw.organization?.estimated_num_employees),
    linkedin_url: raw.person?.linkedin_url,
    company_domain: raw.organization?.website_url?.replace(/^https?:\/\//, "").replace(/\/.*/, ""),
    country: raw.person?.location?.country,
    state: raw.person?.location?.state,
  };
}

async function callClearbit(email: string, domain: string | undefined, apiKey: string): Promise<ClearbitResult> {
  // Stub mode for local tests/dev.
  if (apiKey.startsWith("mock_")) {
    return {
      industry: "Software",
      company_size: "51-200",
      raw_signals: { source: "mock", domain: domain ?? null },
    };
  }

  const url = new URL("https://person.clearbit.com/v2/combined/find");
  url.searchParams.set("email", email);
  if (domain) url.searchParams.set("company", domain);
  const response = await fetchWithRetry(
    url.toString(),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
    { service: "clearbit" },
  );
  const raw = (await response.json()) as {
    company?: { category?: { industry?: string }; metrics?: { employees?: number } };
  };

  return {
    industry: raw.company?.category?.industry,
    company_size: mapCompanySize(raw.company?.metrics?.employees),
    raw_signals: raw as Record<string, unknown>,
  };
}

export async function enrichLead(
  lead: RawLead,
  tenantId: string,
  options: EnrichmentOptions,
): Promise<EnrichedLead> {
  if (!lead.email) {
    throw new EnrichmentError("ENRICHMENT_INPUT_INVALID", "Lead email is required", { tenant_id: tenantId });
  }

  const zeroBounce = await callZeroBounce(lead.email, options.zeroBouncerApiKey);
  const emailStatus = mapEmailStatus(zeroBounce.status);
  if (emailStatus === "invalid" || emailStatus === "catch-all") {
    throw new EnrichmentError("ENRICHMENT_EMAIL_REJECTED", "Email failed validation", {
      tenant_id: tenantId,
      email_status: emailStatus,
      score: zeroBounce.score ?? null,
      sub_status: zeroBounce.sub_status ?? null,
    });
  }

  const apollo = await callApollo(lead, options.apolloApiKey);
  if (!apollo.company && !apollo.title && !apollo.industry) {
    throw new EnrichmentError("ENRICHMENT_APOLLO_EMPTY", "Apollo returned no enrichable fields", {
      tenant_id: tenantId,
    });
  }

  const clearbit = await callClearbit(lead.email, apollo.company_domain ?? lead.company_domain, options.clearbitApiKey);

  const enriched: EnrichedLead = {
    ...lead,
    first_name: lead.first_name ?? apollo.first_name,
    last_name: lead.last_name ?? apollo.last_name,
    title: lead.title ?? apollo.title,
    company: lead.company ?? apollo.company,
    company_domain: lead.company_domain ?? apollo.company_domain,
    linkedin_url: lead.linkedin_url ?? apollo.linkedin_url,
    industry: apollo.industry ?? clearbit.industry,
    company_size: apollo.company_size ?? clearbit.company_size,
    country: apollo.country,
    state: apollo.state,
    email_status: emailStatus,
    email_score: zeroBounce.score ?? undefined,
  };

  return {
    ...enriched,
    raw_signals: clearbit.raw_signals,
  } as EnrichedLead;
}
