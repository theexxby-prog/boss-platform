export type LeadStatus =
  | "ingested"
  | "enriching"
  | "scoring"
  | "reviewing"
  | "accepted"
  | "rejected"
  | "duplicate";

export type CompanySize = "1-50" | "51-200" | "201-1000" | "1000+";
export type Seniority = "C-level" | "VP" | "Director" | "Manager" | "Individual";
export type EmailStatus = "valid" | "invalid" | "catch-all" | "unknown";
export type BantConfidence = "high" | "medium" | "low";
export type AppointmentStatus = "pending" | "scheduled" | "completed" | "no-show";

export interface RawLead {
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  title?: string;
  company?: string;
  company_domain?: string;
  linkedin_url?: string;
}

export interface EnrichedLead extends RawLead {
  industry?: string;
  company_size?: CompanySize;
  country?: string;
  state?: string;
  seniority?: Seniority;
  tech_stack?: string[];
  email_status?: EmailStatus;
  email_score?: number;
}

export interface IcpScoreBreakdown {
  industry: number;
  seniority: number;
  company_size: number;
  geography: number;
  tech: number;
}

export type ScoreDecision = "accept" | "review" | "reject";

export interface ScoringResult {
  score: number;
  breakdown: IcpScoreBreakdown;
  reasons: string[];
  decision: ScoreDecision;
}

export interface CustomAnswer {
  question_id: string;
  question: string;
  answer: string;
}

export interface BantResult {
  budget: string | null;
  authority: string | null;
  need: string | null;
  timeline: string | null;
  score: number;
  confidence: BantConfidence;
  notes: string;
}
