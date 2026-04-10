export type ProductTier = "mql" | "custom_q" | "bant" | "bant_appt";
export type CampaignStatus = "draft" | "active" | "paused" | "complete" | "cancelled";

export interface CustomQuestion {
  id: string;
  question: string;
  type: "text" | "boolean" | "select";
  options?: string[];
  required: boolean;
}
