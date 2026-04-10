import { ServiceError } from "./errors";

export interface ClearbitCombinedResponse {
  person?: {
    name?: {
      givenName?: string;
      familyName?: string;
    };
    employment?: {
      title?: string;
      seniority?: string;
    };
    linkedin?: {
      handle?: string;
    };
    location?: string;
  };
  company?: {
    name?: string;
    domain?: string;
    metrics?: {
      employees?: number;
    };
    category?: {
      industry?: string;
    };
    tech?: string[];
  };
}

export async function findByEmailClearbit(_email: string): Promise<ClearbitCombinedResponse | null> {
  throw new ServiceError("NOT_IMPLEMENTED", "Clearbit wrapper is scaffolded but not implemented", 501);
}
