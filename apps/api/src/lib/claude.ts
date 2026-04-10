import { ServiceError } from "./errors";

export interface ClaudeMessageInput {
  system?: string;
  prompt: string;
  maxTokens: number;
}

export interface ClaudeJsonResponse<T> {
  rawText: string;
  parsed: T;
}

export async function sendClaudeJson<T>(_input: ClaudeMessageInput): Promise<ClaudeJsonResponse<T>> {
  throw new ServiceError("NOT_IMPLEMENTED", "Claude client wrapper is scaffolded but not implemented", 501);
}
