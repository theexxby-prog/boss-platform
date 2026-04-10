import { ServiceError } from "./errors";

export interface ZeroBounceValidationResult {
  status: string;
  sub_status?: string;
  score?: number;
}

export async function validateEmailWithZeroBounce(_email: string): Promise<ZeroBounceValidationResult> {
  throw new ServiceError("NOT_IMPLEMENTED", "ZeroBounce wrapper is scaffolded but not implemented", 501);
}
