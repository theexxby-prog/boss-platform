import { ServiceError } from "./errors";

export interface ApolloPersonMatchRequest {
  email: string;
  first_name?: string;
  last_name?: string;
  organization_name?: string;
}

export interface ApolloPersonLocation {
  country?: string;
  state?: string;
}

export interface ApolloPerson {
  title?: string;
  seniority?: string;
  linkedin_url?: string;
  location?: ApolloPersonLocation;
}

export interface ApolloOrganization {
  industry?: string;
  estimated_num_employees?: number;
  technologies?: string[];
}

export interface ApolloPersonMatchResponse {
  person?: ApolloPerson;
  organization?: ApolloOrganization;
}

export async function matchApolloPerson(
  _input: ApolloPersonMatchRequest,
): Promise<ApolloPersonMatchResponse | null> {
  throw new ServiceError("NOT_IMPLEMENTED", "Apollo wrapper is scaffolded but not implemented", 501);
}
