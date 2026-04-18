// REF: boss-hq/worker/src/services/integrationService.ts — retry, timeout, error-wrapping pattern
// CC-GATE: Claude Code implements this service using Claude API (claude-sonnet-4-20250514)
import { z } from "zod";
import type { CustomAnswer, CustomQuestion, EnrichedLead } from "@boss/types";
import { buildCustomQuestionsPrompt } from "../lib/prompts/custom-questions-prompt";
import { CustomQuestionError } from "./errors";

// ─── Constants ────────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1000;
const TIMEOUT_MS = 30_000;
const MAX_HTTP_RETRIES = 2; // retries for 429 / 5xx

// ─── Zod schema for Claude's response ────────────────────────────────────────

const RawAnswerSchema = z.object({
  question_id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string(),
});

const CustomAnswersSchema = z.array(RawAnswerSchema);

// ─── Public interface ─────────────────────────────────────────────────────────

export interface CustomQuestionsOptions {
  /** Anthropic API key — never hardcoded, always passed from env */
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
    throw new CustomQuestionError(
      "CLAUDE_TIMEOUT",
      `Claude API request timed out or network error: ${String(err)}`,
    );
  }
  clearTimeout(timer);

  // 429 — honour retry-after header before retrying
  if (response.status === 429) {
    if (attempt >= MAX_HTTP_RETRIES) {
      throw new CustomQuestionError(
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
      throw new CustomQuestionError(
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
    throw new CustomQuestionError(
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
    throw new CustomQuestionError("CLAUDE_EMPTY_RESPONSE", "Claude returned no text content");
  }
  return textBlock.text;
}

/**
 * Strips optional markdown code fences, parses JSON, validates with Zod,
 * then cross-validates each answer against its question type constraints.
 *
 * @throws CustomQuestionError on any parse, schema, or type-constraint failure
 */
function parseAndValidateAnswers(
  rawText: string,
  questions: CustomQuestion[],
  attemptLabel: string,
): CustomAnswer[] {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new CustomQuestionError(
      "CLAUDE_INVALID_JSON",
      `Claude returned non-JSON (${attemptLabel})`,
      { raw: rawText.slice(0, 500) },
    );
  }

  const zodResult = CustomAnswersSchema.safeParse(parsed);
  if (!zodResult.success) {
    throw new CustomQuestionError(
      "CLAUDE_SCHEMA_MISMATCH",
      `Claude response failed Zod validation (${attemptLabel})`,
      { issues: zodResult.error.issues, raw: rawText.slice(0, 500) },
    );
  }

  const answers = zodResult.data;
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  for (const answer of answers) {
    const question = questionMap.get(answer.question_id);
    if (!question) continue; // unexpected id — tolerate, caller can filter

    if (question.type === "boolean") {
      if (answer.answer !== "Yes" && answer.answer !== "No") {
        throw new CustomQuestionError(
          "ANSWER_TYPE_VIOLATION",
          `Boolean question "${question.id}" must be "Yes" or "No", got: "${answer.answer}" (${attemptLabel})`,
          { question_id: question.id, answer: answer.answer },
        );
      }
    }

    if (question.type === "select" && question.options && question.options.length > 0) {
      if (!question.options.includes(answer.answer)) {
        throw new CustomQuestionError(
          "ANSWER_TYPE_VIOLATION",
          `Select question "${question.id}" answer "${answer.answer}" not in options (${attemptLabel})`,
          { question_id: question.id, answer: answer.answer, options: question.options },
        );
      }
    }
  }

  return answers as CustomAnswer[];
}

// ─── Public export ────────────────────────────────────────────────────────────

/**
 * Answers custom qualification questions for a lead using Claude as the reasoning engine.
 *
 * Constraints enforced:
 *   - boolean questions → answer must be "Yes" or "No"
 *   - select questions  → answer must be one of the defined options
 *   - text questions    → any string (Claude generates concise sentences)
 *
 * Retry policy:
 *   - HTTP 429      → wait retry-after header (default 5 s), retry (max 2 HTTP retries)
 *   - HTTP 5xx      → exponential backoff 1 s / 2 s / 4 s, retry (max 2 HTTP retries)
 *   - Parse/schema  → re-call Claude once; second failure throws CustomQuestionError
 *
 * @throws {CustomQuestionError} when Claude is unreachable or returns unrecoverable output
 */
export async function answerCustomQuestions(
  lead: EnrichedLead,
  questions: CustomQuestion[],
  options: CustomQuestionsOptions,
): Promise<CustomAnswer[]> {
  if (questions.length === 0) return [];

  const prompt = buildCustomQuestionsPrompt(lead, questions);

  // ── Attempt 1: call Claude + parse ─────────────────────────────────────────
  const rawText1 = await callClaudeApi(prompt, options.anthropicApiKey);

  let answers: CustomAnswer[];
  try {
    answers = parseAndValidateAnswers(rawText1, questions, "attempt 1");
  } catch {
    // ── Retry once on parse / validation failure ────────────────────────────
    const rawText2 = await callClaudeApi(prompt, options.anthropicApiKey);
    // CustomQuestionError from second parse propagates to caller
    answers = parseAndValidateAnswers(rawText2, questions, "attempt 2");
  }

  return answers;
}
