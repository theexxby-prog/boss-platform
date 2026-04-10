// REF: boss-hq/worker/src/routes/clients.ts — method-branch route handler organization pattern

import { Hono } from "hono";
import { z } from "zod";

import { createApiKey, deleteApiKey, findTenantBySlug, findUserByTenantAndEmail, listApiKeysForTenant } from "../db/queries/auth";
import { created, noContent, ok, ApiError } from "../http";
import { issueJwt, sha256Hex } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { requireTenant } from "../middleware/tenant";
import type { AppVariables, EnvBindings } from "../types";

const loginSchema = z.object({
  tenant_slug: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  expires_at: z.number().int().positive().nullable().optional(),
});

function apiKeyPrefix(raw: string): string {
  return raw.slice(0, 16);
}

function randomHex(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function sanitizeApiKeyName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export const authRouter = new Hono<{ Bindings: EnvBindings; Variables: AppVariables }>();

authRouter.post("/login", rateLimit({ requests: 20, windowSeconds: 60 }), async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid login payload", {
      issues: parsed.error.issues,
    });
  }

  const { tenant_slug: tenantSlug, email, password } = parsed.data;
  const tenant = await findTenantBySlug(c.env.DB, tenantSlug);
  if (!tenant || tenant.status !== "active") {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  const user = await findUserByTenantAndEmail(c.env.DB, tenant.id, email);
  if (!user || user.status !== "active") {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  const candidateHash = await sha256Hex(`${c.env.API_KEY_SALT}:${password}`);
  if (candidateHash !== user.password_hash) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  const token = await issueJwt(c.env.JWT_SECRET, {
    sub: user.id,
    tid: tenant.id,
    role: user.role,
  });

  return ok(c, {
    token,
    user: {
      id: user.id,
      tenant_id: tenant.id,
      email: user.email,
      role: user.role,
    },
  });
});

authRouter.post("/logout", requireAuth, requireTenant, async (c) => {
  return noContent(c);
});

authRouter.post("/refresh", requireAuth, requireTenant, async (c) => {
  const auth = c.get("auth");
  if (!auth.userId || !auth.role) {
    throw new ApiError(403, "FORBIDDEN", "Token refresh is only available for JWT users");
  }

  const token = await issueJwt(c.env.JWT_SECRET, {
    sub: auth.userId,
    tid: auth.tenantId,
    role: auth.role,
  });
  return ok(c, { token });
});

authRouter.get("/api-keys", requireAuth, requireTenant, async (c) => {
  const auth = c.get("auth");
  const rows = await listApiKeysForTenant(c.env.DB, auth.tenantId);
  return ok(
    c,
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      key_prefix: row.key_prefix,
      last_used: row.last_used,
      expires_at: row.expires_at,
      created_at: row.created_at,
    })),
  );
});

authRouter.post("/api-keys", requireAuth, requireTenant, async (c) => {
  const auth = c.get("auth");
  if (auth.authType !== "jwt" || (auth.role !== "owner" && auth.role !== "admin")) {
    throw new ApiError(403, "FORBIDDEN", "Only owner/admin users can create API keys");
  }

  const parsed = createApiKeySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid API key payload", {
      issues: parsed.error.issues,
    });
  }

  const raw = `sk-boss-${randomHex(24)}`;
  const keyHash = await sha256Hex(`${c.env.API_KEY_SALT}:${raw}`);
  const id = crypto.randomUUID();
  const now = Date.now();
  await createApiKey(c.env.DB, {
    id,
    tenantId: auth.tenantId,
    keyHash,
    keyPrefix: apiKeyPrefix(raw),
    name: sanitizeApiKeyName(parsed.data.name),
    expiresAt: parsed.data.expires_at ?? null,
    createdAt: now,
  });

  return created(c, { key: raw, id });
});

authRouter.delete("/api-keys/:id", requireAuth, requireTenant, async (c) => {
  const auth = c.get("auth");
  if (auth.authType !== "jwt" || (auth.role !== "owner" && auth.role !== "admin")) {
    throw new ApiError(403, "FORBIDDEN", "Only owner/admin users can delete API keys");
  }

  const id = c.req.param("id");
  if (!id) throw new ApiError(400, "VALIDATION_ERROR", "API key id is required");

  const removed = await deleteApiKey(c.env.DB, auth.tenantId, id);
  if (!removed) throw new ApiError(404, "NOT_FOUND", "API key not found");
  return noContent(c);
});
