import type { D1Database } from "@cloudflare/workers-types";

import { dbAll, dbFirst, dbRun } from "../client";

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  status: string;
}

export interface UserRecord {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: "owner" | "admin" | "viewer" | "ops";
  status: string;
}

export interface ApiKeyRecord {
  id: string;
  tenant_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  last_used: number | null;
  expires_at: number | null;
  created_at: number;
}

export async function findTenantBySlug(db: D1Database, slug: string): Promise<TenantRecord | null> {
  return dbFirst<TenantRecord>(
    db,
    "SELECT id, slug, name, status FROM tenants WHERE slug = ? LIMIT 1",
    [slug],
  );
}

export async function findUserByTenantAndEmail(
  db: D1Database,
  tenantId: string,
  email: string,
): Promise<UserRecord | null> {
  return dbFirst<UserRecord>(
    db,
    "SELECT id, tenant_id, email, password_hash, role, status FROM users WHERE tenant_id = ? AND email = ? LIMIT 1",
    [tenantId, email.toLowerCase()],
  );
}

export async function findUserByIdAndTenant(
  db: D1Database,
  tenantId: string,
  userId: string,
): Promise<UserRecord | null> {
  return dbFirst<UserRecord>(
    db,
    "SELECT id, tenant_id, email, password_hash, role, status FROM users WHERE tenant_id = ? AND id = ? LIMIT 1",
    [tenantId, userId],
  );
}

export async function listApiKeysForTenant(db: D1Database, tenantId: string): Promise<ApiKeyRecord[]> {
  return dbAll<ApiKeyRecord>(
    db,
    "SELECT id, tenant_id, key_hash, key_prefix, name, last_used, expires_at, created_at FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC",
    [tenantId],
  );
}

export async function findApiKeyByHash(db: D1Database, keyHash: string): Promise<ApiKeyRecord | null> {
  return dbFirst<ApiKeyRecord>(
    db,
    "SELECT id, tenant_id, key_hash, key_prefix, name, last_used, expires_at, created_at FROM api_keys WHERE key_hash = ? LIMIT 1",
    [keyHash],
  );
}

export interface CreateApiKeyInput {
  id: string;
  tenantId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  expiresAt: number | null;
  createdAt: number;
}

export async function createApiKey(db: D1Database, input: CreateApiKeyInput): Promise<void> {
  await dbRun(
    db,
    "INSERT INTO api_keys (id, tenant_id, key_hash, key_prefix, name, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [input.id, input.tenantId, input.keyHash, input.keyPrefix, input.name, input.expiresAt, input.createdAt],
  );
}

export async function updateApiKeyLastUsed(
  db: D1Database,
  tenantId: string,
  id: string,
  lastUsed: number,
): Promise<void> {
  await dbRun(db, "UPDATE api_keys SET last_used = ? WHERE tenant_id = ? AND id = ?", [lastUsed, tenantId, id]);
}

export async function deleteApiKey(db: D1Database, tenantId: string, id: string): Promise<boolean> {
  const result = await dbRun(db, "DELETE FROM api_keys WHERE tenant_id = ? AND id = ?", [tenantId, id]);
  return result.rowsAffected > 0;
}
