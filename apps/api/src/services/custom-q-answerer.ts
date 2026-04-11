// CC-GATE 4: Claude Code implements this service using Claude API (claude-sonnet-4-20250514)
// REF: boss-hq/worker/src/services/integrationService.ts — retry, timeout, error-wrapping pattern
// REF: apps/api/src/services/icp-scorer.ts — same Claude API call pattern

import { z } from "zod";
import type { CustomAnswer, CustomQuestion, EnrichedLead } from "@boss/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1024; // Custom Q needs more room than ICP scoring
const TIMEOUT_MS = 30_000;
const MAX_HTTP_RETRIES = 2;

// ─── Error type ───────────────────────────────────────────────────────────────

export class CustomQError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "CustomQError";
    this.code = code;
    this.details = details;
  }
}

// ─── Zod schema — Claude must return one answer object per question ────────────

const CustomQAnswerSchema = z.object({
  question_id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
});

const CustomQResponseSchema = z.object({
  answers: z.array(CustomQAnswerSchema).min(1),
});

type CustomQResponse = z.infer<typeof CustomQResponseSchema>;

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildCustomQPrompt(lead: EnrichedLead, questions: CustomQuestion[]): string {
  const leadContext = [
    `Name:         ${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim(),
    `Title:        ${lead.title ?? "unknown"}`,
    `Company:      ${lead.company ?? "unknown"}`,
    `Industry:     ${lead.industry ?? "unknown"}`,
    `Company size: ${lead.company_size ?? "unknown"}`,
    `Country:      ${lead.country ?? "unknown"}`,
    `Seniority:    ${lead.seniority ?? "unknown"}`,
    lead.tech_stack?.length ? `Tech stack:   ${lead.tech_stack.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const questionList = questions
    .map((q, i) => {
      const optionsLine = q.options?.length
        ? `\n   Options: ${q.options.join(" | ")}`
        : "";
      const requiredLine = q.required ? " (required)" : " (optional)";
      return `${i + 1}. [ID: ${q.id}] [Type: ${q.type}${requiredLine}]\n   ${q.question}${optionsLine}`;
    })
    .join("\n\n");

  return `You are a B2B demand generation assistant. Based solely on the lead's professional profile below, generate the most plausible answers to the custom qualification questions.

Rules:
- For "boolean" questions: answer must be exactly "Yes" or "No"
- For "select" questions: answer must be one of the provided options exactly as written
- For "text" questions: answer in 1–2 sentences, professional tone, grounded in what the profile suggests
- If a required question cannot be answered from the profile, make a conservative reasonable inference — do not leave it blank
- If an optional question cannot be answered at all, use "Unable to determine from available profile data"
- Never fabricate specific facts (revenue figures, exact headcount) — use ranges or qualitative language

## LEAD PROFILE
${leadContext}

## CUSTOM QUESTIONS
${questionList}

## OUTPUT
Respond with ONLY valid JSON. No markdown fences, no explanation.
{
  "answers": [
    { "question_id": "<id>", "question": "<exact question text>", "answer": "<answer>" }
  ]
}
One answer object per question, in the same order as the questions above.`;
}

// ─── Claude API helpers (same pattern as icp-scorer.ts) ──────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
    throw new CustomQError(
      "CLAUDE_TIMEOUT",
      `Claude API request timed out or network error: ${String(err)}`,
    );
  }
  clearTimeout(timer);

  if (response.status === 429) {
    if (attempt >= MAX_HTTP_RETRIES) {
      throw new CustomQError("CLAUDE_RATE_LIMITED", "Claude rate limit exceeded after retries");
    }
    const retryAfterRaw = response.headers.get("retry-after");
    const retryAfterMs = retryAfterRaw ? parseInt(retryAfterRaw, 10) * 1000 : 5_000;
    await sleep(retryAfterMs);
    return callClaudeApi(prompt, apiKey, attempt + 1);
  }

  if (response.status >= 500) {
    if (attempt >= MAX_HTTP_RETRIES) {
      throw new CustomQError("CLAUDE_SERVER_ERROR", `Claude returned ${response.status} after retries`);
    }
    await sleep(Math.pow(2, attempt) * 1_000);
    return callClaudeApi(prompt, apiKey, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new CustomQError("CLAUDE_API_ERROR", `Claude API returned ${response.status}`, { body });
  }

  interface AnthropicResponse {
    content: Array<{ type: string; text: string }>;
  }
  const data = (await response.json()) as AnthropicResponse;
  const textBlock = data.content?.find((c) => c.type === "text");
  if (!textBlock?.text) {
    throw new CustomQError("CLAUDE_EMPTY_RESPONSE", "Claude returned no text content");
  }
  return textBlock.text;
}

function parseResponse(rawText: string, attemptLabel: string): CustomQResponse {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new CustomQError(
      "CLAUDE_INVALID_JSON",
      `Claude returned non-JSON (${attemptLabel})`,
      { raw: rawText.slice(0, 500) },
    );
  }

  const result = CustomQResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new CustomQError(
      "CLAUDE_SCHEMA_MISMATCH",
      `Claude response failed validation (${attemptLabel})`,
      { issues: result.error.issues, raw: rawText.slice(0, 500) },
    );
  }
  return result.data;
}

// ─── Validate answers cover all required questions ────────────────────────────

function validateCompleteness(
  answers: CustomQResponse["answers"],
  questions: CustomQuestion[],
): void {
  const answeredIds = new Set(answers.map((a) => a.question_id));
  const missingRequired = questions.filter(
    (q) => q.required && !answeredIds.has(q.id),
  );
  if (missingRequired.length > 0) {
    throw new CustomQError(
      "MISSING_REQUIRED_ANSWERS",
      `Claude did not answer required questions: ${missingRequired.map((q) => q.id).join(", ")}`,
    );
  }
}

// ─── Public export ────────────────────────────────────────────────────────────

export interface CustomQOptions {
  anthropicApiKey: string;
}

/**
 * Answers custom campaign qualification questions using Claude as the reasoning engine.
 *
 * Answers are inferred from the lead's professional profile — no fabrication of
 * specific facts. Claude is instructed to make conservative inferences for required
 * questions and flag optional questions it cannot answer.
 *
 * Retry policy:
 *   - HTTP 429      → wait retry-after header, retry (max 2 HTTP retries)
 *   - HTTP 5xx      → exponential backoff 1s / 2s (max 2 HTTP retries)
 *   - Parse/schema  → re-call Claude once; second failure propagates
 *
 * @throws {CustomQError} when Claude is unreachable or returns unrecoverable bad JSON
 */
export async function answerCustomQuestions(
  lead: EnrichedLead,
  questions: CustomQuestion[],
  options: CustomQOptions,
): Promise<CustomAnswer[]> {
  if (questions.length === 0) return [];

  const prompt = buildCustomQPrompt(lead, questions);

  const rawText1 = await callClaudeApi(prompt, options.anthropicApiKey);

  let parsed: CustomQResponse;
  try {
    parsed = parseResponse(rawText1, "attempt 1");
  } catch {
    // One retry on parse/schema failure
    const rawText2 = await callClaudeApi(prompt, options.anthropicApiKey);
    parsed = parseResponse(rawText2, "attempt 2");
  }

  validateCompleteness(parsed.answers, questions);

  // Return in the same order as the input questions, filling gaps for optional ones
  const answersById = new Map(parsed.answers.map((a) => [a.question_id, a]));

  return questions.map((q) => {
    const found = answersById.get(q.id);
    return {
      question_id: q.id,
      question: q.question,
      answer: found?.answer ?? "Unable to determine from available profile data",
    };
  });
}
