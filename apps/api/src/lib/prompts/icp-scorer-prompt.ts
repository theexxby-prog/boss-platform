import type { EnrichedLead, IcpProfile } from "@boss/types";

/**
 * Builds the ICP scoring prompt for Claude.
 * Claude must return ONLY valid JSON matching the schema — no preamble, no markdown fences.
 *
 * Expected response shape:
 * {
 *   "breakdown": {
 *     "industry":      <integer 0–100>,
 *     "seniority":     <integer 0–100>,
 *     "company_size":  <integer 0–100>,
 *     "geography":     <integer 0–100>,
 *     "tech":          <integer 0–100>
 *   },
 *   "reasons": ["<reason 1>", ...]   // 2–5 items
 * }
 */
export function buildIcpScorerPrompt(lead: EnrichedLead, profile: IcpProfile): string {
  const leadTech =
    lead.tech_stack && lead.tech_stack.length > 0 ? lead.tech_stack.join(", ") : "unknown";
  const techInclude =
    profile.tech_include.length > 0 ? profile.tech_include.join(", ") : "none specified";
  const techExclude =
    profile.tech_exclude.length > 0 ? profile.tech_exclude.join(", ") : "none specified";
  const titlesExclude =
    profile.titles_exclude.length > 0 ? profile.titles_exclude.join(", ") : "none";

  return `You are an ICP (Ideal Customer Profile) scoring engine for a B2B lead generation agency.
Score the lead below against the ICP profile. Be precise and consistent.

## ICP PROFILE
Target industries     : ${profile.industries.join(", ")}
Target company sizes  : ${profile.company_sizes.join(", ")}
Target geographies    : ${profile.geographies.join(", ")}
Target title keywords : ${profile.titles_include.join(", ")}   (any match = positive signal)
Excluded titles       : ${titlesExclude}
Target seniorities    : ${profile.seniorities.join(", ")}
Required technologies : ${techInclude}   (preferred; partial match is OK)
Disqualifying tech    : ${techExclude}   (presence = automatic 0 for tech dimension)

Dimension weights (sum = 100):
  industry     = ${profile.weight_industry}
  seniority    = ${profile.weight_seniority}
  company_size = ${profile.weight_company_size}
  geography    = ${profile.weight_geography}
  tech         = ${profile.weight_tech}

## LEAD
  name         : ${lead.first_name ?? ""} ${lead.last_name ?? ""}
  title        : ${lead.title ?? "unknown"}
  company      : ${lead.company ?? "unknown"}
  industry     : ${lead.industry ?? "unknown"}
  company_size : ${lead.company_size ?? "unknown"}
  country      : ${lead.country ?? "unknown"}
  seniority    : ${lead.seniority ?? "unknown"}
  tech_stack   : ${leadTech}

## SCORING RULES
For each dimension score 0–100:

- **industry**
  100 = lead's industry is in the target list (exact or near-exact)
  50  = adjacent / related industry
  0   = clearly outside all target industries or unknown

- **seniority**
  100 = title matches a keyword AND seniority level matches the target list
  75  = seniority level matches but no title keyword match
  50  = title keyword matches but seniority level unclear
  0   = title is in the excluded list OR seniority is far below target (e.g., intern, associate when Director+ required)

- **company_size**
  100 = company size falls within one of the target ranges
  50  = adjacent range (one step above or below)
  0   = far outside all ranges or unknown

- **geography**
  100 = country is in the target geography list
  0   = country is not in the list or unknown

- **tech**
  100 = has required technologies and none of the disqualifying ones
  50  = neutral (unknown stack, no required or disqualifying tech)
  0   = has a disqualifying technology (regardless of other tech)
  Partial credit: if some but not all required technologies are present, score proportionally.

## OUTPUT
Respond with ONLY valid JSON. No markdown, no explanation outside the JSON.
{
  "breakdown": {
    "industry": <integer 0-100>,
    "seniority": <integer 0-100>,
    "company_size": <integer 0-100>,
    "geography": <integer 0-100>,
    "tech": <integer 0-100>
  },
  "reasons": ["<concise reason>", "<concise reason>"]
}
Provide 2 to 5 reasons. Each reason must be one sentence explaining a key scoring factor.`;
}
