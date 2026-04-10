// REF: boss-hq/worker/src/services/integrationService.ts — retry, timeout, error-wrapping pattern
import { z } from "zod";
import type { EnrichedLead, IcpProfile, IcpScoreBreakdown, ScoringResult, ScoreDecision } from "@boss/types";
import { buildIcpScorerPrompt } from "../lib/prompts/icp-scorer-prompt";
import { ScoringError } from "./errors";

// ─── Constants ───────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 500;
const TIMEOUT_MS = 30_000;
const MAX_HTTP_RETRIES = 2; // retries for 429 / 5xx

// ─── Zod schema for Claude's response ────────────────────────────────────────

const ClaudeIcpBreakdownSchema = z.object({
  industry: z.number().int().min(0).max(100),
  seniority: z.number().int().min(0).max(100),
  company_size: z.number().int().min(0).max(100),
  geography: z.number().int().min(0).max(100),
  tech: z.number().int().min(0).max(100),
});

const ClaudeIcpResponseSchema = z.object({
  breakdown: ClaudeIcpBreakdownSchema,
  reasons: z.array(z.string().min(1)).min(1).max(10),
});

type ClaudeIcpResponse = z.infer<typeof ClaudeIcpResponseSchema>;

// ─── Public interface ─────────────────────────────────────────────────────────

export interface IcpScoringOptions {
  minReviewScore: number;
  maxAutoAcceptScore: number;
  anthropicApiKey: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the Claude Messages API with retry logic.
 * REF: boss-hq/worker/src/services/integrationService.ts — timeout + 429 + 5xx retry pattern
 *
 * @param prompt   The full user-turn message
 * @param apiKey   Anthropic API key (passed from caller — never hardcoded)
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
    throw new ScoringError(
      "CLAUDE_TIMEOUT",
      `Claude API request timed out or network error: ${String(err)}`,
    );
  }
  clearTimeout(timer);

  // 429 — honour the retry-after header
  if (response.status === 429) {
    if (attempt >= MAX_HTTP_RETRIES) {
      throw new ScoringError("CLAUDE_RATE_LIMITED", "Claude rate limit exceeded after retries");
    }
    const retryAfterRaw = response.headers.get("retry-after");
    const retryAfterMs = retryAfterRaw ? parseInt(retryAfterRaw, 10) * 1000 : 5_000;
    await sleep(retryAfterMs);
    return callClaudeApi(prompt, apiKey, attempt + 1);
  }

  // 5xx — exponential backoff
  if (response.status >= 500) {
    if (attempt >= MAX_HTTP_RETRIES) {
      throw new ScoringError("CLAUDE_SERVER_ERROR", `Claude returned ${response.status} after retries`);
    }
    const backoffMs = Math.pow(2, attempt) * 1_000; // 1 s, 2 s
    await sleep(backoffMs);
    return callClaudeApi(prompt, apiKey, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ScoringError("CLAUDE_API_ERROR", `Claude API returned ${response.status}`, {
      body,
    });
  }

  interface AnthropicMessagesResponse {
    content: Array<{ type: string; text: string }>;
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
  const textBlock = data.content?.find((c) => c.type === "text");
  if (!textBlock?.text) {
    throw new ScoringError("CLAUDE_EMPTY_RESPONSE", "Claude returned no text content");
  }
  return textBlock.text;
}

/**
 * Strips optional markdown code fences and parses + validates Claude's JSON.
 * Throws ScoringError on parse failure or Zod validation failure.
 */
function parseClaudeResponse(rawText: string, attemptLabel: string): ClaudeIcpResponse {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new ScoringError(
      "CLAUDE_INVALID_JSON",
      `Claude returned non-JSON (${attemptLabel})`,
      { raw: rawText.slice(0, 500) },
    );
  }

  const result = ClaudeIcpResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new ScoringError(
      "CLAUDE_SCHEMA_MISMATCH",
      `Claude response failed Zod validation (${attemptLabel})`,
      { issues: result.error.issues, raw: rawText.slice(0, 500) },
    );
  }
  return result.data;
}

/**
 * Applies ICP profile dimension weights to produce a 0–100 composite score.
 * Each dimension is scored 0–100 by Claude; weights must sum to 100.
 */
function computeWeightedScore(breakdown: IcpScoreBreakdown, profile: IcpProfile): number {
  const raw =
    breakdown.industry * profile.weight_industry +
    breakdown.seniority * profile.weight_seniority +
    breakdown.company_size * profile.weight_company_size +
    breakdown.geography * profile.weight_geography +
    breakdown.tech * profile.weight_tech;
  return Math.round(raw / 100);
}

function resolveDecision(score: number, options: IcpScoringOptions): ScoreDecision {
  if (score >= options.maxAutoAcceptScore) return "accept";
  if (score >= options.minReviewScore) return "review";
  return "reject";
}

// ─── Public export ────────────────────────────────────────────────────────────

/**
 * Scores a lead against an ICP profile using Claude as the reasoning engine.
 *
 * Retry policy:
 *   - HTTP 429      → wait retry-after header, retry (max 2 HTTP retries)
 *   - HTTP 5xx      → exponential backoff 1 s / 2 s, retry (max 2 HTTP retries)
 *   - Parse/schema  → re-call Claude once; if second parse also fails, throws ScoringError
 *
 * @throws {ScoringError} when Claude is unreachable or returns unrecoverable bad JSON
 */
export async function scoreLeadIcp(
  lead: EnrichedLead,
  profile: IcpProfile,
  options: IcpScoringOptions,
): Promise<ScoringResult> {
  const prompt = buildIcpScorerPrompt(lead, profile);

  // ── Attempt 1: call Claude + parse ─────────────────────────────────────────
  const rawText1 = await callClaudeApi(prompt, options.anthropicApiKey);

  let claudeResponse: ClaudeIcpResponse;
  try {
    claudeResponse = parseClaudeResponse(rawText1, "attempt 1");
  } catch {
    // ── Retry once on parse/schema failure ──────────────────────────────────
    const rawText2 = await callClaudeApi(prompt, options.anthropicApiKey);
    // If this also fails the ScoringError propagates to the caller
    claudeResponse = parseClaudeResponse(rawText2, "attempt 2");
  }

  const breakdown: IcpScoreBreakdown = claudeResponse.breakdown;
  const score = computeWeightedScore(breakdown, profile);
  const decision = resolveDecision(score, options);

  return {
    score,
    breakdown,
    reasons: claudeResponse.reasons,
    decision,
  };
}
