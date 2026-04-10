import { ServiceError } from "./errors";

export interface InstantlyCreateCampaignInput {
  name: string;
  sendingAccountEmail: string;
  sequenceId: string;
}

export interface InstantlyCampaign {
  id: string;
  name: string;
  status: string;
}

export async function createInstantlyCampaign(
  _input: InstantlyCreateCampaignInput,
): Promise<InstantlyCampaign> {
  throw new ServiceError("NOT_IMPLEMENTED", "Instantly wrapper is scaffolded but not implemented", 501);
}
