import type { D1Database, KVNamespace, Queue, R2Bucket } from "@cloudflare/workers-types";

export interface EnvBindings {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  QUEUE: Queue;
  LEAD_QUEUE: Queue;
  JWT_SECRET: string;
  API_KEY_SALT: string;
  ANTHROPIC_API_KEY?: string;
  ZEROBOUNCE_API_KEY?: string;
  APOLLO_API_KEY?: string;
  CLEARBIT_API_KEY?: string;
  INSTANTLY_API_KEY?: string;
  HUBSPOT_ACCESS_TOKEN?: string;
  QUICKBOOKS_CLIENT_ID?: string;
  QUICKBOOKS_CLIENT_SECRET?: string;
  QUICKBOOKS_REFRESH_TOKEN?: string;
}

export type AuthType = "jwt" | "api_key";
export type UserRole = "owner" | "admin" | "viewer" | "ops";

export interface AuthContext {
  authType: AuthType;
  tenantId: string;
  userId?: string;
  role?: UserRole;
  apiKeyId?: string;
}

export interface AppVariables {
  requestId: string;
  tenantId: string;
  auth: AuthContext;
}
