// REF: boss-hq/worker/src/services/integrationService.ts — retry, timeout, error-wrapping pattern
// CC-GATE: Claude Code implements this service using Claude API (claude-sonnet-4-20250514)
import { z } from "zod";
import type { EnrichedLead } from "@boss/types";
import { buildBantQualifierPrompt } from "../lib/prompts/bant-qualifier-prompt";
import { BantQualificationError } from "./errors";

// ─── Constants ────────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 500;
const TIMEOUT_MS = 30_000;
const MAX_HTTP_RETRIES = 2; // retries for 429 / 5xx

// ─── Public types ─────────────────────────────────────────────────────────────

/** Lead input for BANT qualification — extends EnrichedLead with required lead_id */
export interface BantLead extends EnrichedLead {
  lead_id: string;
}

/** Campaign-level signals used to contextualise BANT scoring */
export interface BantCriteria {
  /** Keywords or phrases that indicate budget availability */
  budget_signals?: string[];
  /** Job titles that indicate purchasing authority (e.g. "CEO", "VP Sales") */
  authority_titles?: string[];
  /** Industries that imply active need for the product */
  need_industries?: string[];
  /** Urgency phrases suggesting near-term buying cycle */
  timeline_signals?: string[];
}

/** Numeric breakdown returned by Claude — each dimension scored 0–25 */
export interface BantBreakdown {
  budget: number;
  authority: number;
  need: number;
  timeline: number;
  reasoning: string;
}

/** Final result returned by qualifyBant */
export interface BantQualificationResult {
  lead_id: string;
  /** Sum of all four dimensions (0–100) */
  bant_score: number;
  bant_breakdown: BantBreakdown;
  /** true when bant_score >= qualificationThreshold */
  qualified: boolean;
  /** Set only when an unrecoverable error occurred */
  error?: string;
}

export interface BantQualificationOptions {
  /** Minimum bant_score to consider a lead qualified (e.g. 60) */
  qualificationThreshold: number;
  /** Anthropic API key — never hardcoded, always passed from env */
  anthropicApiKey: string;
}

// ─── Zod schema for Claude's response ────────────────────────────────────────

const ClaudeBantBreakdownSchema = z.object({
  budget: z.number().int().min(0).max(25),
  authority: z.number().int().min(0).max(25),
  need: z.number().int().min(0).max(25),
  timeline: z.number().int().min(0).max(25),
});

const ClaudeBantResponseSchema = z.object({
  breakdown: ClaudeBantBreakdownSchema,
  reasoning: z.string().min(1),
});

type ClaudeBantResponse = z.infer<typeof ClaudeBantResponseSchema>;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the Claude Messages API with retry logic.
 * REF: boss-hq/worker/src/services/integrationService.ts — timeout + 429 + 5xx retry pattern
 *
 * @param prompt   Full user-turn message text
 * @param apiKey   Anthropic API key passed from caller (never hardcoded)
 * @param attempt  Internal recursion counter (0 = first attempt)
 */
async function callClaudeApi(
  prompt: string,
  apiKey: string,
  attempt = 0,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new BantQualificationError(
      "CLAUDE_TIMEOUT",
      `Claude API request timed out or network error: ${String(err)}`,
    );
  }
  clearTimeout(timer);

  // 429 — honour retry-after header before retrying
  if (response.status === 429) {
    if (attempt >= MAX_HTTP_RETRIES) {
      throw new BantQualificationError(
        "CLAUDE_RATE_LIMITED",
        "Claude rate limit exceeded after retries",
      );
    }
    const retryAfterRaw = response.headers.get("retry-after");
    const retryAfterMs = retryAfterRaw ? parseInt(retryAfterRaw, 10) * 1_000 : 5_000;
    await sleep(retryAfterMs);
    return callClaudeApi(prompt, apiKey, attempt + 1);
  }

  // 5xx — exponential backoff: 1 s, 2 s, 4 s
  if (response.status >= 500) {
    if (attempt >= MAX_HTTP_RETRIES) {
      throw new BantQualificationError(
        "CLAUDE_SERVER_ERROR",
        `Claude returned ${response.status} after retries`,
      );
    }
    const backoffMs = Math.pow(2, attempt) * 1_000;
    await sleep(backoffMs);
    return callClaudeApi(prompt, apiKey, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new BantQualificationError(
      "CLAUDE_API_ERROR",
      `Claude API returned ${response.status}`,
      { body },
    );
  }

  interface AnthropicMessagesResponse {
    content: Array<{ type: string; text: string }>;
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
  const textBlock = data.content?.find((c) => c.type === "text");
  if (!textBlock?.text) {
    throw new BantQualificationError("CLAUDE_EMPTY_RESPONSE", "Claude returned no text content");
  }
  return textBlock.text;
}

/**
 * Strips optional markdown code fences, parses JSON, and validates with Zod.
 * Throws BantQualificationError on any parse or schema failure.
 */
function parseBantResponse(rawText: string, attemptLabel: string): ClaudeBantResponse {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new BantQualificationError(
      "CLAUDE_INVALID_JSON",
      `Claude returned non-JSON (${attemptLabel})`,
      { raw: rawText.slice(0, 500) },
    );
  }

  const result = ClaudeBantResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new BantQualificationError(
      "CLAUDE_SCHEMA_MISMATCH",
      `Claude response failed Zod validation (${attemptLabel})`,
      { issues: result.error.issues, raw: rawText.slice(0, 500) },
    );
  }
  return result.data;
}

// ─── Public export ────────────────────────────────────────────────────────────

/**
 * Qualifies a lead against BANT criteria using Claude as the reasoning engine.
 *
 * Scoring:
 *   - Claude scores Budget, Authority, Need, Timeline each 0–25
 *   - bant_score = sum of all four (0–100)
 *   - qualified = bant_score >= options.qualificationThreshold
 *
 * Retry policy:
 *   - HTTP 429      → wait retry-after header (default 5 s), retry (max 2 HTTP retries)
 *   - HTTP 5xx      → exponential backoff 1 s / 2 s / 4 s, retry (max 2 HTTP retries)
 *   - Parse/schema  → re-call Claude once; if second attempt also fails, throws BantQualificationError
 *
 * @throws {BantQualificationError} when Claude is unreachable or returns unrecoverable bad JSON
 */
export async function qualifyBant(
  lead: BantLead,
  criteria: BantCriteria,
  options: BantQualificationOptions,
): Promise<BantQualificationResult> {
  const prompt = buildBantQualifierPrompt(lead, criteria);

  // ── Attempt 1: call Claude + parse ─────────────────────────────────────────
  const rawText1 = await callClaudeApi(prompt, options.anthropicApiKey);

  let claudeResponse: ClaudeBantResponse;
  try {
    claudeResponse = parseBantResponse(rawText1, "attempt 1");
  } catch {
    // ── Retry once on parse / schema failure ────────────────────────────────
    const rawText2 = await callClaudeApi(prompt, options.anthropicApiKey);
    // BantQualificationError from second parse propagates to caller
    claudeResponse = parseBantResponse(rawText2, "attempt 2");
  }

  const { budget, authority, need, timeline } = claudeResponse.breakdown;
  const bant_score = budget + authority + need + timeline;
  const qualified = bant_score >= options.qualificationThreshold;

  return {
    lead_id: lead.lead_id,
    bant_score,
    bant_breakdown: {
      budget,
      authority,
      need,
      timeline,
      reasoning: claudeResponse.reasoning,
    },
    qualified,
  };
}
