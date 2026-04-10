import type { CompanySize, Seniority } from "./lead";

export interface IcpProfile {
  id: string;
  client_id: string;
  industries: string[];
  company_sizes: CompanySize[];
  geographies: string[];
  titles_include: string[];
  titles_exclude: string[];
  seniorities: Seniority[];
  tech_include: string[];
  tech_exclude: string[];
  weight_industry: number;
  weight_seniority: number;
  weight_company_size: number;
  weight_geography: number;
  weight_tech: number;
  min_score_accept: number;
  min_score_review: number;
}
