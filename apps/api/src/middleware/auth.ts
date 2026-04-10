import { createMiddleware } from "hono/factory";

import { findApiKeyByHash, findUserByIdAndTenant, updateApiKeyLastUsed } from "../db/queries/auth";
import { ApiError } from "../http";
import type { AppVariables, EnvBindings, UserRole } from "../types";

interface JwtPayload {
  sub: string;
  tid: string;
  role: UserRole;
  exp: number;
  iat: number;
}

function utf8(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function utf8Buffer(input: string): ArrayBuffer {
  return new TextEncoder().encode(input).buffer as ArrayBuffer;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64UrlEncode(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const decoded = atob(padded);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8Buffer(value));
  return toHex(new Uint8Array(digest));
}

async function signJwtSegment(input: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", utf8Buffer(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, utf8Buffer(input));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function issueJwt(
  secret: string,
  payload: Omit<JwtPayload, "iat" | "exp">,
  ttlSeconds = 60 * 60,
): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body: JwtPayload = {
    ...payload,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };
  const encodedHeader = base64UrlEncode(utf8(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(utf8(JSON.stringify(body)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await signJwtSegment(signingInput, secret);
  return `${signingInput}.${signature}`;
}

async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;
  const signingInput = `${header}.${payload}`;
  const expectedSignature = await signJwtSegment(signingInput, secret);
  if (!constantTimeEqual(expectedSignature, signature)) return null;
  const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as JwtPayload;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (parsed.exp <= nowSeconds) return null;
  return parsed;
}

export const requireAuth = createMiddleware<{ Bindings: EnvBindings; Variables: AppVariables }>(async (c, next) => {
  const bearer = c.req.header("Authorization");
  const rawApiKey = c.req.header("X-API-Key");

  if (bearer?.startsWith("Bearer ")) {
    const token = bearer.slice(7).trim();
    const parsed = await verifyJwt(token, c.env.JWT_SECRET);
    if (!parsed) throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired token");

    const user = await findUserByIdAndTenant(c.env.DB, parsed.tid, parsed.sub);
    if (!user || user.status !== "active") {
      throw new ApiError(401, "UNAUTHORIZED", "User is not active");
    }

    c.set("auth", {
      authType: "jwt",
      tenantId: parsed.tid,
      userId: parsed.sub,
      role: parsed.role,
    });
    return next();
  }

  if (rawApiKey) {
    const keyHash = await sha256Hex(`${c.env.API_KEY_SALT}:${rawApiKey}`);
    const key = await findApiKeyByHash(c.env.DB, keyHash);
    if (!key) throw new ApiError(401, "UNAUTHORIZED", "Invalid API key");
    if (key.expires_at !== null && key.expires_at <= Date.now()) {
      throw new ApiError(401, "UNAUTHORIZED", "Expired API key");
    }

    await updateApiKeyLastUsed(c.env.DB, key.tenant_id, key.id, Date.now());
    c.set("auth", {
      authType: "api_key",
      tenantId: key.tenant_id,
      apiKeyId: key.id,
    });
    return next();
  }

  throw new ApiError(401, "UNAUTHORIZED", "Authorization header or X-API-Key is required");
});
