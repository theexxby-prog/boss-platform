import { ServiceError } from "./errors";

export interface HubSpotContactInput {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
}

export interface HubSpotContact {
  id: string;
}

export async function upsertHubSpotContact(_input: HubSpotContactInput): Promise<HubSpotContact> {
  throw new ServiceError("NOT_IMPLEMENTED", "HubSpot wrapper is scaffolded but not implemented", 501);
}
