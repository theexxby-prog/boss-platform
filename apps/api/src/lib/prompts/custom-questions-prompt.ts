import type { CustomQuestion, EnrichedLead } from "@boss/types";

/**
 * Builds the custom question answering prompt for Claude.
 * Claude must return ONLY valid JSON — no preamble, no markdown fences.
 *
 * Expected response shape:
 * [
 *   { "question_id": "<id>", "question": "<text>", "answer": "<answer>" },
 *   ...
 * ]
 *
 * Answer constraints per question type:
 *   text    — natural language string, 1–3 sentences, based on lead profile
 *   boolean — exactly "Yes" or "No"
 *   select  — exactly one value from the question's options array
 */
export function buildCustomQuestionsPrompt(lead: EnrichedLead, questions: CustomQuestion[]): string {
  const techStack =
    lead.tech_stack && lead.tech_stack.length > 0 ? lead.tech_stack.join(", ") : "unknown";

  const questionLines = questions
    .map((q, i) => {
      let constraint = "";
      if (q.type === "boolean") {
        constraint = 'Answer MUST be exactly "Yes" or "No".';
      } else if (q.type === "select" && q.options && q.options.length > 0) {
        constraint = `Answer MUST be exactly one of: ${q.options.map((o) => `"${o}"`).join(", ")}.`;
      } else {
        constraint = "Answer in 1–3 concise sentences based on the lead profile.";
      }
      return `${i + 1}. [id: ${q.id}] ${q.question}\n   Type: ${q.type}. ${constraint}${q.required ? " (required)" : " (optional)"}`;
    })
    .join("\n\n");

  return `You are a B2B lead qualification assistant. Answer the custom qualification questions below based solely on the lead's profile. Be conservative — if the profile does not provide sufficient evidence, give a neutral or negative answer rather than speculating.

## LEAD PROFILE
  name         : ${lead.first_name ?? ""} ${lead.last_name ?? ""}
  title        : ${lead.title ?? "unknown"}
  company      : ${lead.company ?? "unknown"}
  industry     : ${lead.industry ?? "unknown"}
  company_size : ${lead.company_size ?? "unknown"}
  country      : ${lead.country ?? "unknown"}
  seniority    : ${lead.seniority ?? "unknown"}
  tech_stack   : ${techStack}

## QUESTIONS
${questionLines}

## ANSWERING RULES
- Base every answer strictly on the lead profile above.
- For **boolean** questions: reply with exactly "Yes" or "No" — no other values accepted.
- For **select** questions: reply with exactly one of the provided options — no paraphrasing.
- For **text** questions: 1–3 sentences maximum. Be factual and concise.
- If information is unavailable for a required question, answer "Unknown" (text) or the most conservative option (boolean = "No").
- Do not fabricate company details not present in the profile.

## OUTPUT FORMAT
Respond with ONLY a valid JSON array. No markdown, no explanation outside the array.
[
  { "question_id": "<exact id from question>", "question": "<exact question text>", "answer": "<your answer>" }
]
The array must contain exactly ${questions.length} element${questions.length === 1 ? "" : "s"}, one per question, in the same order as listed above.`;
}
