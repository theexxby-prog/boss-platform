import type { EnrichedLead } from "@boss/types";
import type { BantCriteria } from "../../services/bant-qualifier";

/**
 * Builds the BANT qualification prompt for Claude.
 * Claude must return ONLY valid JSON — no preamble, no markdown fences.
 *
 * Expected response shape:
 * {
 *   "breakdown": {
 *     "budget":    <integer 0–25>,
 *     "authority": <integer 0–25>,
 *     "need":      <integer 0–25>,
 *     "timeline":  <integer 0–25>
 *   },
 *   "reasoning": "<one paragraph explaining the BANT assessment>"
 * }
 *
 * Total bant_score = budget + authority + need + timeline (0–100).
 */
export function buildBantQualifierPrompt(lead: EnrichedLead & { lead_id: string }, criteria: BantCriteria): string {
  const budgetSignals =
    criteria.budget_signals && criteria.budget_signals.length > 0
      ? criteria.budget_signals.join(", ")
      : "budget, funding, investment, allocated, approved";
  const authorityTitles =
    criteria.authority_titles && criteria.authority_titles.length > 0
      ? criteria.authority_titles.join(", ")
      : "CEO, CTO, CFO, VP, Director, Head of, Owner";
  const needIndustries =
    criteria.need_industries && criteria.need_industries.length > 0
      ? criteria.need_industries.join(", ")
      : "any";
  const timelineSignals =
    criteria.timeline_signals && criteria.timeline_signals.length > 0
      ? criteria.timeline_signals.join(", ")
      : "ASAP, urgent, this quarter, Q2, by end of year, immediate";

  const techStack =
    lead.tech_stack && lead.tech_stack.length > 0 ? lead.tech_stack.join(", ") : "unknown";

  return `You are a BANT (Budget, Authority, Need, Timeline) qualification engine for a B2B lead generation agency.
Assess the lead below and score each BANT dimension. Be conservative — only award points for clear signals.

## BANT CRITERIA
Budget signals   : ${budgetSignals}
Authority titles : ${authorityTitles}   (decision-maker indicators)
Need industries  : ${needIndustries}
Timeline signals : ${timelineSignals}

## LEAD PROFILE
  name         : ${lead.first_name ?? ""} ${lead.last_name ?? ""}
  title        : ${lead.title ?? "unknown"}
  company      : ${lead.company ?? "unknown"}
  industry     : ${lead.industry ?? "unknown"}
  company_size : ${lead.company_size ?? "unknown"}
  country      : ${lead.country ?? "unknown"}
  seniority    : ${lead.seniority ?? "unknown"}
  tech_stack   : ${techStack}

## SCORING RULES
Score each dimension as an integer. The four scores must sum to the total BANT score (0–100).

### BUDGET (0–25)
  25 = Explicit budget signal in title/company signals (e.g. VP-level at funded company, or budget keyword in profile)
  15 = Indirect signals — company size and seniority suggest budget authority
  8  = Possible budget in future; unclear from available data
  0  = No budget signals, very small company, or clear budget absence

### AUTHORITY (0–25)
  25 = Title exactly matches an authority title (CEO, CTO, VP, Director, Head of, Owner)
  15 = Senior but slightly below pure decision-maker level (Sr. Manager, Principal, Lead)
  5  = Evaluator or researcher role, influencer not final decision-maker
  0  = Clearly non-decision-maker (intern, associate, coordinator, junior)

### NEED (0–25)
  25 = Industry is in the target need_industries list AND seniority suggests active need
  15 = Industry is adjacent to need_industries, or need is implied by company profile
  8  = Possible need, insufficient data to confirm
  0  = Industry clearly outside need_industries list, or explicit no-need signal

### TIMELINE (0–25)
  25 = Explicit urgency: title/company context strongly implies current-quarter buying cycle
  15 = Active evaluation implied by seniority + company growth stage
  5  = No urgency signals but no negative signals either
  0  = Explicit future-only timing, "not looking", or evaluating in 12+ months

## OUTPUT
Respond with ONLY valid JSON. No markdown, no text outside the JSON object.
{
  "breakdown": {
    "budget":    <integer 0-25>,
    "authority": <integer 0-25>,
    "need":      <integer 0-25>,
    "timeline":  <integer 0-25>
  },
  "reasoning": "<one paragraph (2–4 sentences) explaining the key factors driving this BANT assessment>"
}`;
}
